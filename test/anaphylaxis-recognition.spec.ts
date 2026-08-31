import { describe, expect, it } from 'vitest';
import { AnaphylaxisRecognitionStrategy } from '../src/modules/cds/strategies/anaphylaxis-recognition.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'anaphylaxis-recognition',
  hook: 'patient-view',
  type: 'anaphylaxis-recognition',
  services: ['vedamd-anaphylaxis-recognition'],
  title: '...',
  description: '...',
  references: [{ label: 'WAO 2020' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};
function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('AnaphylaxisRecognitionStrategy', () => {
  const s = new AnaphylaxisRecognitionStrategy();

  it('silent without sentinel', async () => {
    expect(await s.evaluate(RULE, req({ ageYears: 30, skinOrMucosalInvolvement: true }))).toEqual(
      [],
    );
  });

  it('skin + respiratory → critical adult dose', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 35,
        suspectedAllergicReaction: true,
        skinOrMucosalInvolvement: true,
        respiratoryInvolvement: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/0\.5 mg/);
  });

  it('paediatric weight 20 kg → 0.2 mg auto-computed dose', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 6,
        weightKg: 20,
        suspectedAllergicReaction: true,
        skinOrMucosalInvolvement: true,
        respiratoryInvolvement: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/0\.2 mg/);
  });

  it('paediatric weight 80 kg caps at 0.5 mg adult dose', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 16,
        weightKg: 80,
        suspectedAllergicReaction: true,
        skinOrMucosalInvolvement: true,
        respiratoryInvolvement: true,
      }),
    );
    expect(cards[0].detail).toMatch(/0\.5 mg/);
  });

  it('isolated CVS with documented exposure → critical', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 50,
        suspectedAllergicReaction: true,
        cardiovascularInvolvement: true,
        hypotensionOrShock: true,
        allergenExposureDocumented: true,
      }),
    );
    expect(cards[0].indicator).toBe('critical');
  });

  it('isolated CVS WITHOUT documented exposure → no critical card (insufficient criteria)', async () => {
    expect(
      await s.evaluate(
        RULE,
        req({
          ageYears: 50,
          suspectedAllergicReaction: true,
          cardiovascularInvolvement: true,
        }),
      ),
    ).toEqual([]);
  });

  it('single-system urticaria with exposure → warning', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        suspectedAllergicReaction: true,
        skinOrMucosalInvolvement: true,
        allergenExposureDocumented: true,
      }),
    );
    expect(cards[0].indicator).toBe('warning');
  });
});
