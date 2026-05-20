import { describe, expect, it } from 'vitest';
import { Gad7AnxietyScreenStrategy } from '../src/modules/cds/strategies/gad7-anxiety-screen.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'gad7-anxiety-screen',
  hook: 'patient-view',
  type: 'gad7-anxiety-screen',
  services: ['vedamd-gad7-anxiety-screen'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO mhGAP IG' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('Gad7AnxietyScreenStrategy', () => {
  const s = new Gad7AnxietyScreenStrategy();

  it('does not fire under age 12', async () => {
    expect(
      await s.evaluate(RULE, req({ ageYears: 8, gad7Responses: [0, 0, 0, 0, 0, 0, 0] })),
    ).toEqual([]);
  });

  it('returns info when fewer than 7 responses', async () => {
    const cards = await s.evaluate(RULE, req({ ageYears: 25, gad7Responses: [0, 0, 0] }));
    expect(cards[0].summary).toMatch(/seven GAD-7 responses/i);
  });

  it('rejects out-of-range', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 25, gad7Responses: [0, 0, 0, 0, 0, 0, 4] }),
    );
    expect(cards[0].summary).toMatch(/integers 0\.\.3/);
  });

  it('score 3 → minimal info', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, gad7Responses: [1, 1, 1, 0, 0, 0, 0] }),
    );
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary).toMatch(/GAD-7 3 \(minimal\)/);
  });

  it('score 12 → moderate warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, gad7Responses: [2, 2, 2, 2, 2, 1, 1] }),
    );
    expect(cards[0].indicator).toBe('warning');
    expect(cards[0].summary).toMatch(/moderate/);
  });

  it('score 18 → severe critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 30, gad7Responses: [3, 3, 3, 3, 2, 2, 2] }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary).toMatch(/severe/);
  });
});
