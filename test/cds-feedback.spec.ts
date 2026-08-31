import { describe, expect, it, beforeEach } from 'vitest';
import { CdsFeedbackService } from '../src/modules/cds-feedback/cds-feedback.service';
import type { CdsService } from '../src/modules/cds/cds.service';

function fakeCdsService(
  mapping: Record<string, { ruleId: string; serviceId: string; hook: string }>,
): CdsService {
  return {
    lookupCard: (uuid: string) =>
      mapping[uuid] ? { ...mapping[uuid], createdAt: Date.now() } : null,
  } as unknown as CdsService;
}

describe('CdsFeedbackService — ingest', () => {
  let svc: CdsFeedbackService;
  beforeEach(() => {
    svc = new CdsFeedbackService(
      null,
      fakeCdsService({
        'card-1': {
          ruleId: 'ddi-check',
          serviceId: 'vedamd-medication-prescribe',
          hook: 'medication-prescribe',
        },
        'card-2': { ruleId: 'renal-safety', serviceId: 'vedamd-order-sign', hook: 'order-sign' },
      }),
    );
  });

  it('accepts a valid override entry and attributes it to the originating rule', async () => {
    const r = await svc.ingest('tenant-A', 'vedamd-medication-prescribe', {
      feedback: [
        {
          card: 'card-1',
          outcome: 'overridden',
          overrideReason: {
            reason: { code: 'no-clinical-concern', display: 'Not clinically concerning' },
            userComment: 'Patient stable, monitoring INR.',
          },
        },
      ],
    });
    expect(r.accepted).toBe(1);
    expect(r.rejected).toBe(0);
    const list = await svc.listByRule('tenant-A', 'ddi-check');
    expect(list.length).toBe(1);
    expect(list[0].outcome).toBe('overridden');
    expect(list[0].overrideReasonCode).toBe('no-clinical-concern');
    expect(list[0].userComment).toContain('Patient stable');
  });

  it('rejects entries with an invalid outcome value', async () => {
    const r = await svc.ingest('tenant-A', 'vedamd-medication-prescribe', {
      feedback: [{ card: 'card-1', outcome: 'wat' as never }],
    });
    expect(r.accepted).toBe(0);
    expect(r.rejected).toBe(1);
  });

  it('still ingests when card UUID is unknown (expired) but records null ruleId', async () => {
    const r = await svc.ingest('tenant-A', 'vedamd-medication-prescribe', {
      feedback: [{ card: 'unknown-card', outcome: 'overridden' }],
    });
    expect(r.accepted).toBe(1);
    const summary = await svc.summaryByRule('tenant-A');
    const unattributed = summary.find((s) => s.ruleId === null);
    expect(unattributed).toBeDefined();
    expect(unattributed!.overridden).toBe(1);
  });

  it('scrubs long MRN-like digit runs from user comments before persisting', async () => {
    await svc.ingest('tenant-A', 'vedamd-medication-prescribe', {
      feedback: [
        {
          card: 'card-1',
          outcome: 'overridden',
          overrideReason: {
            reason: { code: 'patient-specific', display: 'Patient-specific reason' },
            userComment: 'MRN 12345678 confirmed allergic, see 2024-03-15 note.',
          },
        },
      ],
    });
    const list = await svc.listByRule('tenant-A', 'ddi-check');
    expect(list[0].userComment).toContain('[digits]');
    expect(list[0].userComment).toContain('[date]');
    expect(list[0].userComment).not.toContain('12345678');
    expect(list[0].userComment).not.toContain('2024-03-15');
  });

  it('caps user comment at 280 characters', async () => {
    const long = 'A'.repeat(500);
    await svc.ingest('tenant-A', 'vedamd-medication-prescribe', {
      feedback: [
        {
          card: 'card-1',
          outcome: 'overridden',
          overrideReason: { reason: { code: 'x' }, userComment: long },
        },
      ],
    });
    const list = await svc.listByRule('tenant-A', 'ddi-check');
    expect(list[0].userComment!.length).toBeLessThanOrEqual(280);
  });

  it('is integrator-scoped — tenant B cannot see tenant A feedback', async () => {
    await svc.ingest('tenant-A', 'vedamd-medication-prescribe', {
      feedback: [{ card: 'card-1', outcome: 'overridden' }],
    });
    const aSummary = await svc.summaryByRule('tenant-A');
    const bSummary = await svc.summaryByRule('tenant-B');
    expect(aSummary.length).toBe(1);
    expect(bSummary.length).toBe(0);
  });
});

describe('CdsFeedbackService — summary aggregation', () => {
  it('computes override rate and top reasons per rule', async () => {
    const svc = new CdsFeedbackService(
      null,
      fakeCdsService({
        'a-1': {
          ruleId: 'ddi-check',
          serviceId: 'vedamd-medication-prescribe',
          hook: 'medication-prescribe',
        },
        'a-2': {
          ruleId: 'ddi-check',
          serviceId: 'vedamd-medication-prescribe',
          hook: 'medication-prescribe',
        },
        'a-3': {
          ruleId: 'ddi-check',
          serviceId: 'vedamd-medication-prescribe',
          hook: 'medication-prescribe',
        },
        'a-4': {
          ruleId: 'ddi-check',
          serviceId: 'vedamd-medication-prescribe',
          hook: 'medication-prescribe',
        },
      }),
    );
    await svc.ingest('tenant-A', 'vedamd-medication-prescribe', {
      feedback: [
        {
          card: 'a-1',
          outcome: 'overridden',
          overrideReason: { reason: { code: 'no-clinical-concern' } },
        },
        {
          card: 'a-2',
          outcome: 'overridden',
          overrideReason: { reason: { code: 'no-clinical-concern' } },
        },
        {
          card: 'a-3',
          outcome: 'overridden',
          overrideReason: { reason: { code: 'already-considered' } },
        },
        { card: 'a-4', outcome: 'accepted' },
      ],
    });
    const summary = await svc.summaryByRule('tenant-A');
    expect(summary.length).toBe(1);
    const ddi = summary[0];
    expect(ddi.ruleId).toBe('ddi-check');
    expect(ddi.totalFeedback).toBe(4);
    expect(ddi.overridden).toBe(3);
    expect(ddi.accepted).toBe(1);
    expect(ddi.overrideRatePct).toBeCloseTo(75, 1);
    expect(ddi.topOverrideReasons[0].code).toBe('no-clinical-concern');
    expect(ddi.topOverrideReasons[0].count).toBe(2);
  });
});
