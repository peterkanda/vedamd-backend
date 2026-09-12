import { describe, expect, it } from 'vitest';
import { isClinicalClaim, ungroundedRefusal } from '../src/modules/assistant/clinical-claim';

/**
 * Mirrors vedamd-mobile/src/llm/__tests__/prompt.test.ts's word lists exactly
 * (same mustRefuse/mayAnswer sets) so the backend's ported gate cannot
 * silently drift from the on-device one it's supposed to match.
 */
describe('clinical-claim gate (backend)', () => {
  const mustRefuse = [
    'What is the dose of amoxicillin for pneumonia?',
    'Paediatric dose of artemether-lumefantrine for a 14 kg child',
    'How much paracetamol can I give a 3 year old?',
    'What is the maximum dose of ibuprofen per day?',
    'Is metformin contraindicated in renal impairment?',
    'Does warfarin interact with fluconazole?',
    'Is sodium valproate safe in pregnancy?',
    'Which antibiotic should I use for cellulitis?',
    'How do I titrate insulin in DKA?',
    'What is the therapeutic range for lithium?',
  ];

  const mayAnswer = [
    'What causes jaundice in newborns?',
    'Explain the pathophysiology of sickle cell disease',
    'What does a raised ESR usually indicate?',
    'How is malaria transmitted?',
  ];

  for (const q of mustRefuse) {
    it(`refuses when ungrounded: "${q}"`, () => {
      expect(isClinicalClaim(q)).toBe(true);
    });
  }

  for (const q of mayAnswer) {
    it(`allows a general answer: "${q}"`, () => {
      expect(isClinicalClaim(q)).toBe(false);
    });
  }

  it('produces a refusal that explains itself and does not hedge into answering', () => {
    const refusal = ungroundedRefusal();
    expect(refusal.length).toBeGreaterThan(80);
    expect(refusal.toLowerCase()).toContain('formulary');
    expect(refusal).not.toMatch(/\b\d+\s*(mg|mcg|ml|g)\b/i);
  });
});
