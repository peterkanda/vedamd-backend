import { describe, expect, it } from 'vitest';
import type { CdsRule } from '../src/modules/conditions/conditions.types';
import type { CdsHookRequest } from '../src/modules/cds/cds.types';
import { StemiFibrinolysisStrategy } from '../src/modules/cds/strategies/stemi-fibrinolysis.strategy';
import { HivPepStrategy } from '../src/modules/cds/strategies/hiv-pep.strategy';
import { HivArtFirstLineStrategy } from '../src/modules/cds/strategies/hiv-art-first-line.strategy';
import { MdrTbRegimenStrategy } from '../src/modules/cds/strategies/mdr-tb-regimen.strategy';
import { CryptococcalInductionStrategy } from '../src/modules/cds/strategies/cryptococcal-induction.strategy';
import { SnakeEnvenomationTreatmentStrategy } from '../src/modules/cds/strategies/snake-envenomation-treatment.strategy';
import { UtiTreatmentStrategy } from '../src/modules/cds/strategies/uti-treatment.strategy';
import { AsthmaStepUpStrategy } from '../src/modules/cds/strategies/asthma-step-up.strategy';
import { AnaemiaIronReplacementStrategy } from '../src/modules/cds/strategies/anaemia-iron-replacement.strategy';
import { HypothyroidismInitStrategy } from '../src/modules/cds/strategies/hypothyroidism-init.strategy';

const mkRule = (type: string): CdsRule =>
  ({
    id: type,
    type,
    hook: 'patient-view',
    title: type,
    description: '',
    references: [{ label: 'ref' }],
    ruleVersion: '0.1.0',
    reviewStatus: 'draft',
    evidenceLevel: 'A',
  }) as unknown as CdsRule;

const req = (context: Record<string, unknown>): CdsHookRequest => ({
  hook: 'patient-view',
  hookInstance: 't',
  context,
});

describe('STEMI fibrinolysis pathway', () => {
  const s = new StemiFibrinolysisStrategy();
  const rule = mkRule('stemi-fibrinolysis');
  it('does not fire without a STEMI', async () => {
    expect(await s.evaluate(rule, req({ symptomOnsetMin: 60 }))).toHaveLength(0);
  });
  it('PCI within 120 min → primary PCI', async () => {
    const c = await s.evaluate(
      rule,
      req({ stEcgFinding: 'stemi', transferToPciMin: 60, symptomOnsetMin: 90 }),
    );
    expect(c[0].indicator).toBe('critical');
    expect(c[0].summary).toMatch(/primary PCI/i);
  });
  it('no PCI access + no contraindication → fibrinolysis now', async () => {
    const c = await s.evaluate(
      rule,
      req({ stEcgFinding: 'stemi', transferToPciMin: 240, symptomOnsetMin: 120 }),
    );
    expect(c[0].detail).toMatch(/tenecteplase|streptokinase/i);
  });
  it('contraindication diverts to emergency PCI transfer', async () => {
    const c = await s.evaluate(
      rule,
      req({
        suspectedStemi: true,
        transferToPciMin: 240,
        symptomOnsetMin: 120,
        recentStroke: true,
      }),
    );
    expect(c[0].summary).toMatch(/contraindicated/i);
    expect(c[0].detail).toMatch(/do NOT lyse/i);
  });
  it('onset > 12 h → fibrinolysis not beneficial', async () => {
    const c = await s.evaluate(
      rule,
      req({ stEcgFinding: 'stemi', transferToPciMin: 240, symptomOnsetMin: 800 }),
    );
    expect(c[0].summary).toMatch(/not routinely beneficial/i);
  });
});

describe('HIV PEP', () => {
  const s = new HivPepStrategy();
  const rule = mkRule('hiv-pep');
  it('does not fire without an exposure', async () => {
    expect(await s.evaluate(rule, req({ hoursSinceExposure: 2 }))).toHaveLength(0);
  });
  it('within 72 h → start PEP (critical)', async () => {
    const c = await s.evaluate(
      rule,
      req({ exposureType: 'occupational', hoursSinceExposure: 6, sourceHivStatus: 'unknown' }),
    );
    expect(c[0].indicator).toBe('critical');
    expect(c[0].detail).toMatch(/dolutegravir/i);
  });
  it('renal impairment avoids TDF', async () => {
    const c = await s.evaluate(
      rule,
      req({
        exposureType: 'sexual',
        hoursSinceExposure: 10,
        sourceHivStatus: 'positive',
        eGFR: 30,
      }),
    );
    expect(c[0].detail).toMatch(/avoid TDF/i);
  });
  it('> 72 h → outside window (warning)', async () => {
    const c = await s.evaluate(rule, req({ exposureType: 'sexual', hoursSinceExposure: 90 }));
    expect(c[0].indicator).toBe('warning');
    expect(c[0].summary).toMatch(/outside the PEP window/i);
  });
  it('source negative → not indicated (info)', async () => {
    const c = await s.evaluate(
      rule,
      req({ exposureType: 'occupational', hoursSinceExposure: 4, sourceHivStatus: 'negative' }),
    );
    expect(c[0].indicator).toBe('info');
  });
});

describe('HIV first-line ART', () => {
  const s = new HivArtFirstLineStrategy();
  const rule = mkRule('hiv-art-first-line');
  it('recommends TLD for an adult', async () => {
    const c = await s.evaluate(rule, req({ hivStatus: 'positive', weightKg: 60 }));
    expect(c[0].summary).toMatch(/TLD/);
    expect(c[0].indicator).toBe('info');
  });
  it('rifampicin overlap adds supplementary DTG', async () => {
    const c = await s.evaluate(
      rule,
      req({ hivStatus: 'positive', coMedications: ['rifampicin', 'isoniazid'] }),
    );
    expect(c[0].indicator).toBe('warning');
    expect(c[0].detail).toMatch(/EXTRA dolutegravir/i);
  });
  it('HBV co-infection mandates tenofovir backbone', async () => {
    const c = await s.evaluate(rule, req({ newArtInitiation: true, hbsag: 'positive' }));
    expect(c[0].detail).toMatch(/tenofovir-containing/i);
  });
  it('under 30 kg → paediatric regimen', async () => {
    const c = await s.evaluate(rule, req({ hivStatus: 'positive', weightKg: 22 }));
    expect(c[0].summary).toMatch(/< 30 kg/);
  });
});

describe('MDR-TB regimen builder', () => {
  const s = new MdrTbRegimenStrategy();
  const rule = mkRule('mdr-tb-regimen-builder');
  it('does not fire without RIF resistance', async () => {
    expect(await s.evaluate(rule, req({ drugResistance: 'isoniazid-mono' }))).toHaveLength(0);
  });
  it('MDR → BPaLM', async () => {
    const c = await s.evaluate(rule, req({ drugResistance: 'MDR', weightKg: 55, qtcMs: 420 }));
    expect(c[0].summary).toMatch(/BPaLM/);
  });
  it('FQ resistance → BPaL', async () => {
    const c = await s.evaluate(
      rule,
      req({ drugResistance: ['RIF-resistant', 'fluoroquinolone-resistant'] }),
    );
    expect(c[0].summary).toMatch(/BPaL\b/);
  });
  it('QTcF > 500 → critical hold', async () => {
    const c = await s.evaluate(rule, req({ drugResistance: 'RR-TB', qtcMs: 520 }));
    expect(c[0].indicator).toBe('critical');
    expect(c[0].detail).toMatch(/do NOT start/i);
  });
});

describe('Cryptococcal induction', () => {
  const s = new CryptococcalInductionStrategy();
  const rule = mkRule('cryptococcal-induction');
  it('does not fire without CrAg', async () => {
    expect(await s.evaluate(rule, req({ csfOpeningPressure: 30 }))).toHaveLength(0);
  });
  it('CrAg+ → AMBITION single-dose liposomal regimen', async () => {
    const c = await s.evaluate(rule, req({ crAg: 'positive' }));
    expect(c[0].indicator).toBe('critical');
    expect(c[0].detail).toMatch(/liposomal amphotericin B 10 mg\/kg/);
    expect(c[0].detail).toMatch(/flucytosine/);
  });
  it('liposomal unavailable → deoxycholate fallback', async () => {
    const c = await s.evaluate(rule, req({ crAg: true, liposomalAvailable: false }));
    expect(c[0].detail).toMatch(/deoxycholate/);
  });
  it('raised opening pressure → therapeutic LP', async () => {
    const c = await s.evaluate(rule, req({ crAg: 'positive', csfOpeningPressure: 32 }));
    expect(c[0].detail).toMatch(/therapeutic LP/i);
  });
});

describe('Snake envenomation', () => {
  const s = new SnakeEnvenomationTreatmentStrategy();
  const rule = mkRule('snake-envenomation-treatment');
  it('systemic features → antivenom (critical)', async () => {
    const c = await s.evaluate(rule, req({ envenomationFeatures: ['neurotoxicity'] }));
    expect(c[0].indicator).toBe('critical');
    expect(c[0].detail).toMatch(/antivenom/i);
    expect(c[0].detail).toMatch(/adrenaline/i);
  });
  it('incoagulable WBCT → antivenom', async () => {
    const c = await s.evaluate(rule, req({ wbct20MinResult: 'unclotted' }));
    expect(c[0].indicator).toBe('critical');
  });
  it('no systemic signs → observe (warning)', async () => {
    const c = await s.evaluate(rule, req({ suspectedSnakebite: true, wbct20MinResult: 'clotted' }));
    expect(c[0].indicator).toBe('warning');
    expect(c[0].detail).toMatch(/observe/i);
  });
});

describe('UTI treatment', () => {
  const s = new UtiTreatmentStrategy();
  const rule = mkRule('uti-treatment');
  it('does not fire without sentinel', async () => {
    expect(await s.evaluate(rule, req({ sex: 'female' }))).toHaveLength(0);
  });
  it('non-pregnant woman → 3-day nitrofurantoin', async () => {
    const c = await s.evaluate(rule, req({ suspectedUti: true, sex: 'female', pregnant: false }));
    expect(c[0].indicator).toBe('info');
    expect(c[0].detail).toMatch(/nitrofurantoin/i);
    expect(c[0].detail).toMatch(/3 days/);
  });
  it('low eGFR avoids nitrofurantoin', async () => {
    const c = await s.evaluate(rule, req({ suspectedUti: true, sex: 'female', eGFR: 30 }));
    expect(c[0].detail).toMatch(/contraindicated/i);
  });
  it('third-trimester pregnancy → cefalexin', async () => {
    const c = await s.evaluate(
      rule,
      req({ suspectedUti: true, sex: 'female', pregnant: true, gestationWeeks: 34 }),
    );
    expect(c[0].indicator).toBe('warning');
    expect(c[0].detail).toMatch(/cefalexin/i);
  });
  it('man → 7-day course + investigate', async () => {
    const c = await s.evaluate(rule, req({ suspectedUti: true, sex: 'male' }));
    expect(c[0].indicator).toBe('warning');
    expect(c[0].detail).toMatch(/7-day|investigate/i);
  });
});

describe('Asthma step-up (GINA)', () => {
  const s = new AsthmaStepUpStrategy();
  const rule = mkRule('asthma-step-up');
  it('does not fire without asthma', async () => {
    expect(await s.evaluate(rule, req({ diagnoses: ['copd'] }))).toHaveLength(0);
  });
  it('well-controlled → maintain', async () => {
    const c = await s.evaluate(
      rule,
      req({
        diagnoses: ['asthma'],
        gina: { currentStep: 2, SABAUsePerWeek: 0 },
        symptomControl: 'controlled',
      }),
    );
    expect(c[0].indicator).toBe('info');
    expect(c[0].summary).toMatch(/maintain GINA Step 2/);
  });
  it('reliever overuse → step up', async () => {
    const c = await s.evaluate(
      rule,
      req({ diagnoses: ['asthma'], gina: { currentStep: 2, SABAUsePerWeek: 4 } }),
    );
    expect(c[0].indicator).toBe('warning');
    expect(c[0].summary).toMatch(/step up GINA 2 . 3|step up GINA 2/);
  });
  it('step 5 → severe-asthma referral', async () => {
    const c = await s.evaluate(
      rule,
      req({ diagnoses: ['asthma'], gina: { currentStep: 5, SABAUsePerWeek: 5 } }),
    );
    expect(c[0].summary).toMatch(/Step 5/);
    expect(c[0].detail).toMatch(/severe-asthma/i);
  });
});

describe('Anaemia iron replacement', () => {
  const s = new AnaemiaIronReplacementStrategy();
  const rule = mkRule('anaemia-iron-replacement');
  it('does not fire without Hb', async () => {
    expect(await s.evaluate(rule, req({ ferritin: 5 }))).toHaveLength(0);
  });
  it('iron deficiency → alternate-day oral iron', async () => {
    const c = await s.evaluate(rule, req({ hb: 105, ferritin: 8, weightKg: 60 }));
    expect(c[0].indicator).toBe('info');
    expect(c[0].detail).toMatch(/alternate days/i);
    expect(c[0].detail).toMatch(/iron deficit/i);
  });
  it('auto-detects g/dL Hb', async () => {
    const c = await s.evaluate(rule, req({ hb: 10.5, ferritin: 8 }));
    expect(c[0].detail).toMatch(/105 g\/L/);
  });
  it('severe (Hb < 70) → IV iron ± transfusion', async () => {
    const c = await s.evaluate(rule, req({ hb: 62, ferritin: 6 }));
    expect(c[0].indicator).toBe('warning');
    expect(c[0].detail).toMatch(/transfusion/i);
  });
  it('CKD anaemia → IV iron', async () => {
    const c = await s.evaluate(rule, req({ hb: 100, ferritin: 20, ckdAnaemia: true }));
    expect(c[0].detail).toMatch(/ferric carboxymaltose/i);
  });
  it('normal iron studies → look elsewhere', async () => {
    const c = await s.evaluate(rule, req({ hb: 110, ferritin: 200, tsat: 40 }));
    expect(c[0].summary).toMatch(/do not confirm iron deficiency/i);
  });
});

describe('Hypothyroidism init', () => {
  const s = new HypothyroidismInitStrategy();
  const rule = mkRule('hypothyroidism-init');
  it('does not fire without TSH', async () => {
    expect(await s.evaluate(rule, req({ ageYears: 40 }))).toHaveLength(0);
  });
  it('TSH > 10 in a young patient → full dose', async () => {
    const c = await s.evaluate(rule, req({ tsh: 14, ageYears: 35, weightKg: 70 }));
    expect(c[0].summary).toMatch(/full-dose/i);
    expect(c[0].detail).toMatch(/112 µg\/day|1\.6 µg\/kg/);
  });
  it('elderly/IHD → start low', async () => {
    const c = await s.evaluate(rule, req({ tsh: 14, ageYears: 78 }));
    expect(c[0].indicator).toBe('warning');
    expect(c[0].detail).toMatch(/25 µg/);
  });
  it('pregnancy → tight target + dose increase', async () => {
    const c = await s.evaluate(rule, req({ tsh: 6, pregnant: true }));
    expect(c[0].detail).toMatch(/2\.5 mU\/L/);
  });
  it('subclinical without indication → monitor', async () => {
    const c = await s.evaluate(rule, req({ tsh: 6, ageYears: 40 }));
    expect(c[0].summary).toMatch(/not routinely indicated/i);
  });
});
