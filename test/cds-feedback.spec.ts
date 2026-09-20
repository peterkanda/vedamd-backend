import { afterEach, describe, expect, it, beforeEach, vi } from 'vitest';
import {
  CdsFeedbackService,
  MODEL_COMPARISON_MIN_SAMPLE,
} from '../src/modules/cds-feedback/cds-feedback.service';
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

describe('CdsFeedbackService — per-model adoption of LLM cards', () => {
  type Lookup = {
    ruleId: string;
    serviceId: string;
    hook: string;
    model?: string;
    indicator?: string;
  };

  function svcWith(mapping: Record<string, Lookup>): CdsFeedbackService {
    return new CdsFeedbackService(null, {
      lookupCard: (uuid: string) =>
        mapping[uuid] ? { ...mapping[uuid], createdAt: Date.now() } : null,
    } as unknown as CdsService);
  }

  const ai = (model: string, indicator = 'warning'): Lookup => ({
    ruleId: 'agentic-reasoner',
    serviceId: 'vedamd-agentic',
    hook: 'agentic',
    model,
    indicator,
  });

  afterEach(() => vi.useRealTimers());

  it('groups LLM feedback by model, ignores rule cards, and counts unexplained critical accepts', async () => {
    const svc = svcWith({
      'old-1': ai('medgemma-4b'),
      'new-1': ai('medgemma-27b', 'critical'),
      'new-2': ai('medgemma-27b', 'critical'),
      'rule-1': { ruleId: 'ddi-check', serviceId: 's', hook: 'h' },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    await svc.ingest('t', 'vedamd-agentic', {
      feedback: [
        {
          card: 'old-1',
          outcome: 'overridden',
          overrideReason: { reason: { code: 'unavailable-at-facility' } },
        },
      ],
    });
    vi.setSystemTime(new Date('2026-09-10T00:00:00Z'));
    await svc.ingest('t', 'vedamd-agentic', {
      feedback: [
        {
          card: 'new-1',
          outcome: 'accepted',
          acceptReason: { reason: { code: 'verified-against-guideline' } },
        },
        { card: 'new-2', outcome: 'accepted' },
        { card: 'rule-1', outcome: 'accepted' },
      ],
    });

    const report = await svc.summaryByModel('t');
    expect(report.models.map((m) => m.modelId)).toEqual(['medgemma-27b', 'medgemma-4b']);
    const [current, previous] = report.models;
    expect(current).toMatchObject({
      totalFeedback: 2,
      criticalFeedback: 2,
      criticalAccepted: 2,
      criticalAcceptedWithoutReason: 1,
      topAcceptReasons: [{ code: 'verified-against-guideline', count: 1 }],
    });
    expect(previous.topOverrideReasons).toEqual([{ code: 'unavailable-at-facility', count: 1 }]);
    expect(report.comparison).toMatchObject({
      currentModelId: 'medgemma-27b',
      previousModelId: 'medgemma-4b',
      overrideRateDeltaPct: -100,
      criticalAcceptRateDeltaPct: null,
      comparable: false,
    });
  });

  it('marks a comparison comparable only once both models reach the minimum sample', async () => {
    const mapping: Record<string, Lookup> = {};
    for (let i = 0; i < MODEL_COMPARISON_MIN_SAMPLE; i++) {
      mapping[`a${i}`] = ai('model-a');
      mapping[`b${i}`] = ai('model-b');
    }
    const svc = svcWith(mapping);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-01T00:00:00Z'));
    await svc.ingest('t', 's', {
      feedback: Object.keys(mapping)
        .filter((k) => k.startsWith('a'))
        .map((card) => ({ card, outcome: 'accepted' as const })),
    });
    vi.setSystemTime(new Date('2026-09-02T00:00:00Z'));
    await svc.ingest('t', 's', {
      feedback: Object.keys(mapping)
        .filter((k) => k.startsWith('b'))
        .map((card) => ({ card, outcome: 'overridden' as const })),
    });
    const report = await svc.summaryByModel('t');
    expect(report.comparison).toMatchObject({
      currentModelId: 'model-b',
      overrideRateDeltaPct: 100,
      comparable: true,
    });
  });

  it('keeps reason codes on the side of the outcome they belong to', async () => {
    const svc = svcWith({ c: ai('m') });
    await svc.ingest('t', 's', {
      feedback: [
        {
          card: 'c',
          outcome: 'accepted',
          overrideReason: { reason: { code: 'stray' } },
          acceptReason: { reason: { code: 'consistent-with-findings' } },
        },
      ],
    });
    const [row] = await svc.listByRule('t', 'agentic-reasoner');
    expect(row).toMatchObject({
      overrideReasonCode: null,
      acceptReasonCode: 'consistent-with-findings',
      modelId: 'm',
      indicator: 'warning',
    });
  });
});
