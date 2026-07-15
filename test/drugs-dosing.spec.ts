import { describe, expect, it, beforeEach } from 'vitest';
import { DrugsService } from '../src/modules/drugs/drugs.service';
import { makeKnowledgeService } from './helpers/knowledge';

let svc: DrugsService;
beforeEach(() => {
  svc = new DrugsService(makeKnowledgeService());
  svc.onModuleInit();
});

describe('DrugsService.calculateDose — paediatric mg/kg', () => {
  it('paracetamol for a 14 kg / 4 yo child → 210 mg per dose', () => {
    const r = svc.calculateDose('paracetamol', { weightKg: 14, ageYears: 4 })!;
    expect(r.protocol).toBe('paediatric');
    expect(r.calculatedDose?.mgPerDose).toBe(210);
    expect(r.calculatedDose?.route).toBe('oral');
    expect(r.calculatedDose?.maxMgPerDay).toBe(14 * 60);
    expect(r.calculatedDose?.capsApplied).toEqual([]);
  });

  it('paracetamol stays under the 1000 mg single-dose cap for boundary paediatric weights', () => {
    const r = svc.calculateDose('paracetamol', { weightKg: 49, ageYears: 10 })!;
    expect(r.protocol).toBe('paediatric');
    expect(r.calculatedDose?.mgPerDose).toBeLessThanOrEqual(1000);
  });

  it('amoxicillin for 20 kg / 5 yo → 500 mg q8h', () => {
    const r = svc.calculateDose('amoxicillin', { weightKg: 20, ageYears: 5 })!;
    expect(r.protocol).toBe('paediatric');
    expect(r.calculatedDose?.mgPerDose).toBe(500);
    expect(r.calculatedDose?.frequency).toContain('8');
  });

  it('amoxicillin paediatric with CrCl 20 → uses q12h frequency from renal band', () => {
    const r = svc.calculateDose('amoxicillin', { weightKg: 20, ageYears: 5, crClMlMin: 20 })!;
    expect(r.protocol).toBe('paediatric');
    expect(r.calculatedDose?.frequency).toContain('12');
    expect(r.narrative).toContain('Renal adjustment');
  });
});

describe('DrugsService.calculateDose — sub-milligram precision (regression: 0 mg / 2× rounding)', () => {
  // Rounding to whole mg previously returned "0 mg" for adrenaline and
  // naloxone in a small child, and doubled morphine. These assert the
  // exact clinical numbers so the bug can never regress silently.
  it('adrenaline 5 kg → 0.05 mg (never 0 mg) for anaphylaxis', () => {
    const r = svc.calculateDose('adrenaline', { weightKg: 5, ageYears: 1 })!;
    expect(r.protocol).toBe('paediatric');
    expect(r.calculatedDose?.mgPerDose).toBe(0.05);
    expect(r.calculatedDose?.mgPerDose).toBeGreaterThan(0);
    expect(r.narrative).not.toMatch(/\b0 mg\b/);
  });

  it('adrenaline 10 kg → 0.1 mg', () => {
    const r = svc.calculateDose('adrenaline', { weightKg: 10, ageYears: 2 })!;
    expect(r.calculatedDose?.mgPerDose).toBe(0.1);
  });

  it('naloxone 5 kg → 0.05 mg (never 0 mg)', () => {
    const r = svc.calculateDose('naloxone', { weightKg: 5, ageYears: 1 })!;
    expect(r.protocol).toBe('paediatric');
    expect(r.calculatedDose?.mgPerDose).toBe(0.05);
    expect(r.calculatedDose?.mgPerDose).toBeGreaterThan(0);
  });

  it('morphine 5 kg → 0.5 mg (NOT 1 mg — old code doubled it)', () => {
    const r = svc.calculateDose('morphine', { weightKg: 5, ageYears: 1 })!;
    expect(r.protocol).toBe('paediatric');
    expect(r.calculatedDose?.mgPerDose).toBe(0.5);
  });

  it('morphine 4 kg neonate → 0.4 mg (NOT 0 mg)', () => {
    const r = svc.calculateDose('morphine', { weightKg: 4, ageYears: 0 })!;
    expect(r.calculatedDose?.mgPerDose).toBe(0.4);
  });

  it('large doses stay whole (paracetamol 14 kg → 210 mg, no spurious decimals)', () => {
    const r = svc.calculateDose('paracetamol', { weightKg: 14, ageYears: 4 })!;
    expect(r.calculatedDose?.mgPerDose).toBe(210);
    expect(Number.isInteger(r.calculatedDose!.mgPerDose)).toBe(true);
  });
});

describe('DrugsService.calculateDose — age vs weight routing', () => {
  // Age is authoritative when supplied: a large child stays on the
  // paediatric path (capped by maxMgPerDose), never handed an adult regimen.
  it('55 kg 10-year-old is dosed paediatric, not adult (age wins over 50 kg weight)', () => {
    const r = svc.calculateDose('paracetamol', { weightKg: 55, ageYears: 10 })!;
    expect(r.protocol).toBe('paediatric');
    // 55 × 15 = 825, under the 1000 mg cap.
    expect(r.calculatedDose?.mgPerDose).toBe(825);
  });

  it('13-year-old is dosed adult regardless of a sub-50 kg weight', () => {
    const r = svc.calculateDose('paracetamol', { weightKg: 45, ageYears: 13 })!;
    expect(r.protocol).toBe('adult');
  });

  it('omitting age adds an explicit weight-inference warning', () => {
    const r = svc.calculateDose('paracetamol', { weightKg: 45 })!;
    expect(r.warnings.some((w) => w.toLowerCase().includes('age not supplied'))).toBe(true);
  });

  it('omitting age still routes ≥50 kg to the adult path (with the warning)', () => {
    const r = svc.calculateDose('paracetamol', { weightKg: 60 })!;
    expect(r.protocol).toBe('adult');
    expect(r.warnings.some((w) => w.toLowerCase().includes('age not supplied'))).toBe(true);
  });
});

describe('DrugsService.calculateDose — non-mg/kg paediatric safety', () => {
  // Regression: drugs that carry mgPerKgPerDose = 0 as a "not mg/kg-dosed"
  // sentinel (insulin, IV fluids, topicals, vitamins) must NEVER yield a
  // computed 0 mg dose — that would be a dangerous, meaningless figure.
  for (const slug of ['insulin-regular', 'sodium-chloride-0-9']) {
    it(`${slug} for a child does not return a 0 mg calculated dose`, () => {
      const r = svc.calculateDose(slug, { weightKg: 10, ageYears: 2 })!;
      expect(r.protocol).not.toBe('paediatric');
      expect(r.calculatedDose).toBeUndefined();
      // The real regimen lives in the narrative, not a mg figure.
      expect(r.narrative.length).toBeGreaterThan(0);
    });
  }
});

describe('DrugsService.calculateDose — adult regimens', () => {
  it('paracetamol for 60 kg / 30 yo → adult protocol with regimen narrative', () => {
    const r = svc.calculateDose('paracetamol', { weightKg: 60, ageYears: 30 })!;
    expect(r.protocol).toBe('adult');
    expect(r.calculatedDose).toBeUndefined();
    expect(r.narrative).toMatch(/500.*1000/);
  });

  it('amlodipine for an adult returns the adult regimen', () => {
    const r = svc.calculateDose('amlodipine', { weightKg: 70, ageYears: 55 })!;
    expect(r.protocol).toBe('adult');
    expect(r.narrative).toContain('5 mg');
  });
});

describe('DrugsService.calculateDose — renal safety', () => {
  it('metformin with CrCl 20 → refused, contraindication surfaced', () => {
    const r = svc.calculateDose('metformin', { weightKg: 70, ageYears: 55, crClMlMin: 20 })!;
    expect(r.protocol).toBe('not-applicable');
    expect(r.calculatedDose).toBeUndefined();
    expect(r.contraindications.some((c) => c.includes('Contraindicated'))).toBe(true);
  });

  it('metformin with CrCl 35 → adult regimen with renal note', () => {
    const r = svc.calculateDose('metformin', { weightKg: 70, ageYears: 55, crClMlMin: 35 })!;
    expect(r.protocol).toBe('adult');
    expect(r.narrative).toContain('50% dose reduction');
  });

  it('metformin with CrCl 60 → adult regimen with no renal narrative', () => {
    const r = svc.calculateDose('metformin', { weightKg: 70, ageYears: 55, crClMlMin: 60 })!;
    expect(r.protocol).toBe('adult');
    expect(r.narrative).not.toContain('Renal adjustment');
  });
});

describe('DrugsService.calculateDose — special protocols', () => {
  it('warfarin → individualised, no mg returned', () => {
    const r = svc.calculateDose('warfarin', { weightKg: 70, ageYears: 65 })!;
    expect(r.protocol).toBe('individualised');
    expect(r.calculatedDose).toBeUndefined();
    expect(r.narrative).toContain('individualised');
  });

  it('artemether-lumefantrine for 10 kg / 2 yo → weight-banded narrative', () => {
    const r = svc.calculateDose('artemether-lumefantrine', { weightKg: 10, ageYears: 2 })!;
    expect(r.protocol).toBe('weight-banded');
    expect(r.calculatedDose).toBeUndefined();
    expect(r.narrative.toLowerCase()).toContain('weight');
  });

  it('artemether-lumefantrine for 3 kg child → warning that minimum weight 5 kg is not met', () => {
    const r = svc.calculateDose('artemether-lumefantrine', { weightKg: 3, ageYears: 0 })!;
    expect(r.protocol).toBe('weight-banded');
    expect(r.warnings.some((w) => w.includes('minimum'))).toBe(true);
  });
});

describe('DrugsService.calculateDose — edge cases', () => {
  it('paediatric request on an adult-only drug → not-applicable', () => {
    const r = svc.calculateDose('amlodipine', { weightKg: 18, ageYears: 6 })!;
    expect(r.protocol).toBe('not-applicable');
    expect(r.warnings.some((w) => w.toLowerCase().includes('paediatric'))).toBe(true);
  });

  it('unknown drug → null', () => {
    expect(svc.calculateDose('not-a-real-drug', { weightKg: 50 })).toBeNull();
  });

  it('result always carries traceability metadata (rule version, evidence level, status)', () => {
    const r = svc.calculateDose('paracetamol', { weightKg: 14, ageYears: 4 })!;
    expect(r.ruleVersion).toBeTruthy();
    expect(r.evidenceLevel).toBeTruthy();
    expect(r.reviewStatus).toBe('draft');
    expect(r.references.length).toBeGreaterThan(0);
  });
});
