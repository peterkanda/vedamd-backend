import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { CdsService } from '../src/modules/cds/cds.service';
import { DrugsService } from '../src/modules/drugs/drugs.service';
import { CdsStrategyRegistry } from '../src/modules/cds/strategies/registry';
import { DrugDrugInteractionStrategy } from '../src/modules/cds/strategies/ddi.strategy';
import { RenalSafetyStrategy } from '../src/modules/cds/strategies/renal-safety.strategy';
import { PregnancySafetyStrategy } from '../src/modules/cds/strategies/pregnancy-safety.strategy';
import { AwareStewardshipStrategy } from '../src/modules/cds/strategies/aware-stewardship.strategy';
import { MedicationMonitoringStrategy } from '../src/modules/cds/strategies/medication-monitoring.strategy';
import { ImciFeverUnder5Strategy } from '../src/modules/cds/strategies/imci-fever-under5.strategy';
import { PenHypertensionScreenStrategy } from '../src/modules/cds/strategies/pen-hypertension-screen.strategy';
import { PenDiabetesScreenStrategy } from '../src/modules/cds/strategies/pen-diabetes-screen.strategy';
import { PaediatricDosingStrategy } from '../src/modules/cds/strategies/paediatric-dosing.strategy';
import { AncFirstContactStrategy } from '../src/modules/cds/strategies/anc-first-contact.strategy';
import { ImciDiarrhoeaUnder5Strategy } from '../src/modules/cds/strategies/imci-diarrhoea-under5.strategy';
import { ImciPneumoniaUnder5Strategy } from '../src/modules/cds/strategies/imci-pneumonia-under5.strategy';
import { ImciMalariaUnder5Strategy } from '../src/modules/cds/strategies/imci-malaria-under5.strategy';
import { ImciMalnutritionUnder5Strategy } from '../src/modules/cds/strategies/imci-malnutrition-under5.strategy';
import { PenCvdRiskStrategy } from '../src/modules/cds/strategies/pen-cvd-risk.strategy';
import { AdultCapCrb65Strategy } from '../src/modules/cds/strategies/adult-cap-crb65.strategy';
import { AdultAcsRecognitionStrategy } from '../src/modules/cds/strategies/adult-acs-recognition.strategy';
import { AdultMalariaStrategy } from '../src/modules/cds/strategies/adult-malaria.strategy';
import { AncPreeclampsiaScreenStrategy } from '../src/modules/cds/strategies/anc-preeclampsia-screen.strategy';
import { AncPphRiskScreenStrategy } from '../src/modules/cds/strategies/anc-pph-risk-screen.strategy';
import { TbSymptomScreenStrategy } from '../src/modules/cds/strategies/tb-symptom-screen.strategy';
import { Phq9DepressionScreenStrategy } from '../src/modules/cds/strategies/phq9-depression-screen.strategy';
import { Gad7AnxietyScreenStrategy } from '../src/modules/cds/strategies/gad7-anxiety-screen.strategy';
import { CageAidSubstanceScreenStrategy } from '../src/modules/cds/strategies/cage-aid-substance-screen.strategy';
import { MhgapPsychosisScreenStrategy } from '../src/modules/cds/strategies/mhgap-psychosis-screen.strategy';
import { HivPitcTriggerStrategy } from '../src/modules/cds/strategies/hiv-pitc-trigger.strategy';
import { ImciYoungInfantStrategy } from '../src/modules/cds/strategies/imci-young-infant.strategy';
import { StrokeFastRecognitionStrategy } from '../src/modules/cds/strategies/stroke-fast-recognition.strategy';
import { SepsisQSofaStrategy } from '../src/modules/cds/strategies/sepsis-qsofa.strategy';
import { CopdExacerbationStrategy } from '../src/modules/cds/strategies/copd-exacerbation.strategy';
import { AnaphylaxisRecognitionStrategy } from '../src/modules/cds/strategies/anaphylaxis-recognition.strategy';
import { DkaRecognitionStrategy } from '../src/modules/cds/strategies/dka-recognition.strategy';
import { SevereAsthmaExacerbationStrategy } from '../src/modules/cds/strategies/severe-asthma-exacerbation.strategy';
import { SnakeBiteTriageStrategy } from '../src/modules/cds/strategies/snake-bite-triage.strategy';
import { SyphilisScreenStrategy } from '../src/modules/cds/strategies/syphilis-screen.strategy';
import { HeartFailureDecompensationStrategy } from '../src/modules/cds/strategies/heart-failure-decompensation.strategy';
import { ViralHepatitisScreenStrategy } from '../src/modules/cds/strategies/viral-hepatitis-screen.strategy';
import { StiSyndromicStrategy } from '../src/modules/cds/strategies/sti-syndromic.strategy';
import { GdmScreenStrategy } from '../src/modules/cds/strategies/gdm-screen.strategy';
import { StatusEpilepticusStrategy } from '../src/modules/cds/strategies/status-epilepticus.strategy';
import { ImciMeaslesStrategy } from '../src/modules/cds/strategies/imci-measles.strategy';
import { PmtctStrategy } from '../src/modules/cds/strategies/pmtct.strategy';
import { PostpartumCareStrategy } from '../src/modules/cds/strategies/postpartum-care.strategy';
import { CkdScreenStrategy } from '../src/modules/cds/strategies/ckd-screen.strategy';
import { HeadInjuryTriageStrategy } from '../src/modules/cds/strategies/head-injury-triage.strategy';
import { HhsRecognitionStrategy } from '../src/modules/cds/strategies/hhs-recognition.strategy';
import { TbTreatmentStrategy } from '../src/modules/cds/strategies/tb-treatment.strategy';
import { RabiesPepStrategy } from '../src/modules/cds/strategies/rabies-pep.strategy';
import { NeonatalJaundiceStrategy } from '../src/modules/cds/strategies/neonatal-jaundice.strategy';
import { SickleCellCrisisStrategy } from '../src/modules/cds/strategies/sickle-cell-crisis.strategy';
import { DengueArboviralStrategy } from '../src/modules/cds/strategies/dengue-arboviral.strategy';
import { SchistosomiasisTreatmentStrategy } from '../src/modules/cds/strategies/schistosomiasis-treatment.strategy';
import { ImciEarInfectionStrategy } from '../src/modules/cds/strategies/imci-ear-infection.strategy';
import { NeonatalSepsisStrategy } from '../src/modules/cds/strategies/neonatal-sepsis.strategy';
import { HeatStrokeStrategy } from '../src/modules/cds/strategies/heat-stroke.strategy';
import { AfibAnticoagulationStrategy } from '../src/modules/cds/strategies/afib-anticoagulation.strategy';
import { UgibBlatchfordStrategy } from '../src/modules/cds/strategies/ugib-blatchford.strategy';
import { VteProphylaxisStrategy } from '../src/modules/cds/strategies/vte-prophylaxis.strategy';
import { CiwaArStrategy } from '../src/modules/cds/strategies/ciwa-ar.strategy';
import { PneumoniaCurb65Strategy } from '../src/modules/cds/strategies/pneumonia-curb65.strategy';
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
import { PhiFreeLogger } from '../src/common/phi-free-logger';
import type { AppConfig } from '../src/config/configuration';
import { makeKnowledgeService } from './helpers/knowledge';

function makeService(): CdsService {
  const config = {
    get: (key: string) => {
      if (key === 'stateless.capabilityExtensionUrl') {
        return 'http://vedamd.io/CapabilityStatement/stateless';
      }
      if (key === 'audit.hashSecret') return 'test-secret';
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
  const log = new PhiFreeLogger({ service: 'test', hashSecret: 'test-secret', strict: true });
  const knowledge = makeKnowledgeService();
  const drugs = new DrugsService(knowledge);
  drugs.onModuleInit();
  const registry = new CdsStrategyRegistry(
    new DrugDrugInteractionStrategy(drugs),
    new RenalSafetyStrategy(drugs),
    new PregnancySafetyStrategy(drugs),
    new AwareStewardshipStrategy(drugs),
    new MedicationMonitoringStrategy(drugs),
    new ImciFeverUnder5Strategy(),
    new ImciDiarrhoeaUnder5Strategy(),
    new ImciPneumoniaUnder5Strategy(),
    new ImciMalariaUnder5Strategy(),
    new ImciMalnutritionUnder5Strategy(),
    new ImciYoungInfantStrategy(),
    new PenHypertensionScreenStrategy(),
    new PenDiabetesScreenStrategy(),
    new PenCvdRiskStrategy(),
    new PaediatricDosingStrategy(drugs),
    new AdultCapCrb65Strategy(),
    new AdultAcsRecognitionStrategy(),
    new AdultMalariaStrategy(),
    new AncFirstContactStrategy(),
    new AncPreeclampsiaScreenStrategy(),
    new AncPphRiskScreenStrategy(),
    new TbSymptomScreenStrategy(),
    new Phq9DepressionScreenStrategy(),
    new Gad7AnxietyScreenStrategy(),
    new CageAidSubstanceScreenStrategy(),
    new MhgapPsychosisScreenStrategy(),
    new HivPitcTriggerStrategy(),
    new StrokeFastRecognitionStrategy(),
    new SepsisQSofaStrategy(),
    new CopdExacerbationStrategy(),
    new AnaphylaxisRecognitionStrategy(),
    new DkaRecognitionStrategy(),
    new SevereAsthmaExacerbationStrategy(),
    new SnakeBiteTriageStrategy(),
    new SyphilisScreenStrategy(),
    new HeartFailureDecompensationStrategy(),
    new ViralHepatitisScreenStrategy(),
    new StiSyndromicStrategy(),
    new GdmScreenStrategy(),
    new StatusEpilepticusStrategy(),
    new ImciMeaslesStrategy(),
    new PmtctStrategy(),
    new PostpartumCareStrategy(),
    new CkdScreenStrategy(),
    new HeadInjuryTriageStrategy(),
    new HhsRecognitionStrategy(),
    new TbTreatmentStrategy(),
    new RabiesPepStrategy(),
    new NeonatalJaundiceStrategy(),
    new SickleCellCrisisStrategy(),
    new DengueArboviralStrategy(),
    new SchistosomiasisTreatmentStrategy(),
    new ImciEarInfectionStrategy(),
    new NeonatalSepsisStrategy(),
    new HeatStrokeStrategy(),
    new AfibAnticoagulationStrategy(),
    new UgibBlatchfordStrategy(),
    new VteProphylaxisStrategy(),
    new CiwaArStrategy(),
    new PneumoniaCurb65Strategy(),
    new StemiFibrinolysisStrategy(),
    new HivPepStrategy(),
    new HivArtFirstLineStrategy(),
    new MdrTbRegimenStrategy(),
    new CryptococcalInductionStrategy(),
    new SnakeEnvenomationTreatmentStrategy(),
    new UtiTreatmentStrategy(),
    new AsthmaStepUpStrategy(),
    new AnaemiaIronReplacementStrategy(),
    new HypothyroidismInitStrategy(),
  );
  return new CdsService(config, log, knowledge, registry);
}

describe('CdsService', () => {
  it('exposes a CDS Hooks service descriptor list', () => {
    const services = makeService().listServices();
    expect(services.length).toBeGreaterThan(0);
    for (const s of services) {
      expect(s.id).toBeTruthy();
      expect(s.hook).toBeTruthy();
      expect(s.title).toBeTruthy();
    }
  });

  it('returns an empty card set for unknown service ids', async () => {
    const res = await makeService().evaluateHook('does-not-exist', {
      hook: 'patient-view',
      hookInstance: 'x',
      context: {},
    });
    expect(res.cards).toEqual([]);
  });

  it('declares stateless: true in its CapabilityStatement (FR-093)', () => {
    const cap = makeService().capabilityStatement();
    expect(cap.resourceType).toBe('CapabilityStatement');
    expect(cap.extension).toContainEqual({
      url: 'http://vedamd.io/CapabilityStatement/stateless',
      valueBoolean: true,
    });
  });
});

describe('CdsService.evaluateHook — drug-drug interaction rule (end-to-end)', () => {
  it('fires a moderate-severity card for paracetamol + warfarin on medication-prescribe', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'test-1',
      context: { medications: ['paracetamol', 'warfarin'] },
    });
    expect(res.cards.length).toBe(1);
    const card = res.cards[0];
    expect(card.indicator).toBe('warning');
    expect(card.summary).toMatch(/MODERATE/);
    expect(card.summary.toLowerCase()).toContain('paracetamol');
    expect(card.summary.toLowerCase()).toContain('warfarin');
    expect(card.detail).toContain('Mechanism');
    expect(card.detail).toContain('Management');
    expect(card.extension?.['http://vedamd.io/Card/recommendation'].ruleId).toBe('ddi-check');
  });

  it('returns zero cards when only one drug is supplied', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'test-2',
      context: { medications: ['paracetamol'] },
    });
    expect(res.cards.length).toBe(0);
  });

  it('returns zero cards when no known interaction exists', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'test-3',
      context: { medications: ['paracetamol', 'amlodipine'] },
    });
    expect(res.cards.length).toBe(0);
  });

  it('reads proposed + current medications from separate fields', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'test-4',
      context: { proposed: ['paracetamol'], current: ['warfarin'] },
    });
    expect(res.cards.length).toBe(1);
  });

  it('does not fire the DDI rule on patient-view (hook mismatch)', async () => {
    const res = await makeService().evaluateHook('vedamd-patient-view', {
      hook: 'patient-view',
      hookInstance: 'test-5',
      context: { medications: ['paracetamol', 'warfarin'] },
    });
    const ddi = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'ddi-check',
    );
    expect(ddi.length).toBe(0);
  });

  it('silently ignores unknown drug slugs', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'test-6',
      context: { medications: ['unobtanium', 'warfarin'] },
    });
    expect(res.cards.length).toBe(0);
  });

  it('emits a card carrying VedaMD traceability metadata (rule id, version, evidence)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'test-7',
      context: { medications: ['paracetamol', 'warfarin'] },
    });
    const meta = res.cards[0].extension?.['http://vedamd.io/Card/recommendation'];
    expect(meta).toBeTruthy();
    expect(meta!.ruleId).toBe('ddi-check');
    expect(meta!.ruleVersion).toBe('0.1.0-placeholder');
    expect(meta!.evidenceLevel).toBe('expert-consensus');
    expect(Date.parse(meta!.generatedAt)).not.toBeNaN();
  });
});

describe('CdsService.evaluateHook — renal-safety rule', () => {
  it('refuses prescribing metformin at CrCl 20 (prohibited renal band)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'r1',
      context: { medications: ['metformin'], crClMlMin: 20 },
    });
    const renalCards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'renal-safety',
    );
    expect(renalCards.length).toBe(1);
    expect(renalCards[0].indicator).toBe('critical');
    expect(renalCards[0].summary.toLowerCase()).toContain('metformin');
    expect(renalCards[0].summary).toContain('20 mL/min');
    expect(renalCards[0].detail).toContain('Contraindicated');
  });

  it('does not fire at CrCl 35 (matches a non-prohibited renal band)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'r2',
      context: { medications: ['metformin'], crClMlMin: 35 },
    });
    const renalCards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'renal-safety',
    );
    expect(renalCards.length).toBe(0);
  });

  it('does not fire when CrCl is not supplied at all', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'r3',
      context: { medications: ['metformin'] },
    });
    const renalCards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'renal-safety',
    );
    expect(renalCards.length).toBe(0);
  });

  it('does not fire for drugs without prohibited renal bands at low CrCl', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'r4',
      context: { medications: ['paracetamol'], crClMlMin: 15 },
    });
    const renalCards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'renal-safety',
    );
    expect(renalCards.length).toBe(0);
  });
});

describe('CdsService.evaluateHook — pregnancy-safety rule', () => {
  it('fires a critical card on warfarin when pregnant is true', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'p1',
      context: { medications: ['warfarin'], pregnant: true },
    });
    const cards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'pregnancy-safety',
    );
    expect(cards.length).toBe(1);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].summary.toLowerCase()).toContain('warfarin');
    expect((cards[0].detail ?? '').toLowerCase()).toContain('teratogenic');
  });

  it('does not fire when pregnant is false', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'p2',
      context: { medications: ['warfarin'], pregnant: false },
    });
    const cards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'pregnancy-safety',
    );
    expect(cards.length).toBe(0);
  });

  it('does not fire on drugs without the contraindicated flag (e.g. paracetamol)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'p3',
      context: { medications: ['paracetamol'], pregnant: true },
    });
    const cards = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'pregnancy-safety',
    );
    expect(cards.length).toBe(0);
  });
});

describe('CdsService.evaluateHook — multi-rule composition', () => {
  it('fires DDI + renal + pregnancy in a single invocation when all apply', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'multi-1',
      context: {
        medications: ['paracetamol', 'warfarin', 'metformin'],
        crClMlMin: 20,
        pregnant: true,
      },
    });
    const byRule = (id: string) =>
      res.cards.filter((c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === id);
    expect(byRule('ddi-check').length).toBe(1); // paracetamol + warfarin
    expect(byRule('renal-safety').length).toBe(1); // metformin at CrCl 20
    expect(byRule('pregnancy-safety').length).toBe(1); // warfarin
    expect(res.cards.length).toBe(3);
  });
});

describe('CdsService.evaluateHook — AWaRe stewardship rule', () => {
  it('fires a warning card for ciprofloxacin (Watch class)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'a1',
      context: { medications: ['ciprofloxacin'] },
    });
    const aware = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'aware-stewardship',
    );
    expect(aware.length).toBe(1);
    expect(aware[0].indicator).toBe('warning');
    expect(aware[0].summary).toContain('Watch');
    expect(aware[0].summary.toLowerCase()).toContain('ciprofloxacin');
    // Fluoroquinolones (J01M) have no Access sibling in the seed; the
    // formulary-specific list line is absent when the formulary holds none.
    expect(aware[0].detail ?? '').not.toContain('alternatives in this formulary');
  });

  it('does not fire for amoxicillin (Access)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'a2',
      context: { medications: ['amoxicillin'] },
    });
    const aware = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'aware-stewardship',
    );
    expect(aware.length).toBe(0);
  });

  it('does not fire for drugs without an AWaRe classification (e.g. paracetamol)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'a3',
      context: { medications: ['paracetamol'] },
    });
    const aware = res.cards.filter(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'aware-stewardship',
    );
    expect(aware.length).toBe(0);
  });

  it('lifts the AWaRe stewardship warnings from the drug record into the card detail', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'a4',
      context: { medications: ['ciprofloxacin'] },
    });
    const aware = res.cards.find(
      (c) => c.extension?.['http://vedamd.io/Card/recommendation'].ruleId === 'aware-stewardship',
    );
    expect(aware?.detail).toContain('Stewardship warnings');
    expect((aware?.detail ?? '').toLowerCase()).toContain('tendinopathy');
  });
});

describe('CdsService.evaluateHook — medication-monitoring rule (patient-view)', () => {
  it('fires one info card per current medication with monitoring (e.g. warfarin)', async () => {
    const res = await makeService().evaluateHook('vedamd-patient-view', {
      hook: 'patient-view',
      hookInstance: 'm1',
      context: { currentMedications: ['warfarin'] },
    });
    const cards = res.cards.filter(
      (c) =>
        c.extension?.['http://vedamd.io/Card/recommendation'].ruleId ===
        'medication-monitoring-reminder',
    );
    expect(cards.length).toBe(1);
    expect(cards[0].indicator).toBe('info');
    expect(cards[0].summary.toLowerCase()).toContain('warfarin');
    expect((cards[0].detail ?? '').toLowerCase()).toContain('inr');
  });

  it('fires one card per drug for multiple current medications', async () => {
    const res = await makeService().evaluateHook('vedamd-patient-view', {
      hook: 'patient-view',
      hookInstance: 'm2',
      context: { currentMedications: ['warfarin', 'metformin', 'amlodipine'] },
    });
    const cards = res.cards.filter(
      (c) =>
        c.extension?.['http://vedamd.io/Card/recommendation'].ruleId ===
        'medication-monitoring-reminder',
    );
    // warfarin and metformin have monitoring; amlodipine has monitoring too (BP at 4-week intervals).
    expect(cards.length).toBeGreaterThanOrEqual(2);
    const summaries = cards.map((c) => c.summary.toLowerCase()).join(' ');
    expect(summaries).toContain('warfarin');
    expect(summaries).toContain('metformin');
  });

  it('does not fire for drugs without a monitoring list (e.g. amoxicillin)', async () => {
    const res = await makeService().evaluateHook('vedamd-patient-view', {
      hook: 'patient-view',
      hookInstance: 'm3',
      context: { currentMedications: ['amoxicillin'] },
    });
    const cards = res.cards.filter(
      (c) =>
        c.extension?.['http://vedamd.io/Card/recommendation'].ruleId ===
        'medication-monitoring-reminder',
    );
    expect(cards.length).toBe(0);
  });

  it('does not fire when no current medications are supplied', async () => {
    const res = await makeService().evaluateHook('vedamd-patient-view', {
      hook: 'patient-view',
      hookInstance: 'm4',
      context: {},
    });
    expect(res.cards.length).toBe(0);
  });

  it('does not fire on medication-prescribe (hook mismatch)', async () => {
    const res = await makeService().evaluateHook('vedamd-medication-prescribe', {
      hook: 'medication-prescribe',
      hookInstance: 'm5',
      context: { currentMedications: ['warfarin'] },
    });
    const cards = res.cards.filter(
      (c) =>
        c.extension?.['http://vedamd.io/Card/recommendation'].ruleId ===
        'medication-monitoring-reminder',
    );
    expect(cards.length).toBe(0);
  });

  it('deduplicates when the same drug appears twice', async () => {
    const res = await makeService().evaluateHook('vedamd-patient-view', {
      hook: 'patient-view',
      hookInstance: 'm6',
      context: { currentMedications: ['warfarin'], medications: ['warfarin'] },
    });
    const cards = res.cards.filter(
      (c) =>
        c.extension?.['http://vedamd.io/Card/recommendation'].ruleId ===
        'medication-monitoring-reminder',
    );
    expect(cards.length).toBe(1);
  });
});
