import { describe, expect, it } from 'vitest';
import { StiSyndromicStrategy } from '../src/modules/cds/strategies/sti-syndromic.strategy';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';

const RULE: CdsRule = {
  id: 'sti-syndromic',
  hook: 'patient-view',
  type: 'sti-syndromic',
  services: ['vedamd-sti-syndromic'],
  title: '...',
  description: '...',
  references: [{ label: 'WHO STI' }],
  ruleVersion: '0.1.0',
  reviewStatus: 'draft',
  evidenceLevel: 'A',
};

function req(context: Record<string, unknown>): CdsHookRequest {
  return { hook: 'patient-view', hookInstance: 'test', context };
}

describe('StiSyndromicStrategy', () => {
  const s = new StiSyndromicStrategy();

  it('silent without syndrome', async () => {
    expect(await s.evaluate(RULE, req({}))).toEqual([]);
  });

  it('urethral discharge → ceftriaxone + doxycycline', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 25, suspectedStiSyndrome: 'urethral-discharge' }),
    );
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].detail).toMatch(/Ceftriaxone 500 mg/);
    expect(cards[0].detail).toMatch(/doxycycline/i);
  });

  it('urethral discharge with cephalosporin allergy → gentamicin + azithromycin', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        suspectedStiSyndrome: 'urethral-discharge',
        cephalosporinAllergy: true,
      }),
    );
    expect(cards[0].detail).toMatch(/gentamicin 240 mg/);
  });

  it('severe PID → admit for IV', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 28,
        suspectedStiSyndrome: 'lower-abdominal-pain',
        severePidFeatures: true,
      }),
    );
    expect(cards[0].summary).toMatch(/Severe PID/);
    expect(cards[0].detail).toMatch(/IV ceftriaxone 1 g/);
  });

  it('scrotal swelling without torsion exclusion → refer first', async () => {
    const cards = await s.evaluate(
      RULE,
      req({ ageYears: 22, suspectedStiSyndrome: 'scrotal-swelling' }),
    );
    expect(cards[0].detail).toMatch(/torsion/i);
  });

  it('scrotal swelling with torsion excluded → dual antibiotic cover', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 22,
        suspectedStiSyndrome: 'scrotal-swelling',
        testicularTorsionExcluded: true,
      }),
    );
    expect(cards[0].detail).toMatch(/ceftriaxone/i);
  });

  it('genital ulcer with penicillin allergy → doxycycline alternative', async () => {
    const cards = await s.evaluate(
      RULE,
      req({
        ageYears: 30,
        suspectedStiSyndrome: 'genital-ulcer',
        penicillinAllergy: true,
      }),
    );
    expect(cards[0].detail).toMatch(/doxycycline 100 mg/);
  });
});
