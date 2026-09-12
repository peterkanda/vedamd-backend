/**
 * Builds a fully-wired CdsService for tests: real signed content, real
 * drug/allergy/hepatic services, every rule strategy registered, and the
 * FHIR normalisation layer in front. Shared so specs exercise the same
 * graph the Nest module assembles in production.
 */
import { ConfigService } from '@nestjs/config';
import { CdsService } from '../../src/modules/cds/cds.service';
import { CdsNormalizerService } from '../../src/modules/cds/normalize/cds-normalizer.service';
import { DrugsService } from '../../src/modules/drugs/drugs.service';
import { CdsStrategyRegistry } from '../../src/modules/cds/strategies/registry';
import { DrugDrugInteractionStrategy } from '../../src/modules/cds/strategies/ddi.strategy';
import { DrugAllergyCrossReactivityStrategy } from '../../src/modules/cds/strategies/drug-allergy-cross-reactivity.strategy';
import { AllergyService } from '../../src/modules/allergy/allergy.service';
import { RenalSafetyStrategy } from '../../src/modules/cds/strategies/renal-safety.strategy';
import { HepaticSafetyStrategy } from '../../src/modules/cds/strategies/hepatic-safety.strategy';
import { HepaticDoseService } from '../../src/modules/hepatic-dose/hepatic-dose.service';
import { PregnancySafetyStrategy } from '../../src/modules/cds/strategies/pregnancy-safety.strategy';
import { AwareStewardshipStrategy } from '../../src/modules/cds/strategies/aware-stewardship.strategy';
import { MedicationMonitoringStrategy } from '../../src/modules/cds/strategies/medication-monitoring.strategy';
import { ImciFeverUnder5Strategy } from '../../src/modules/cds/strategies/imci-fever-under5.strategy';
import { PenHypertensionScreenStrategy } from '../../src/modules/cds/strategies/pen-hypertension-screen.strategy';
import { PenDiabetesScreenStrategy } from '../../src/modules/cds/strategies/pen-diabetes-screen.strategy';
import { PaediatricDosingStrategy } from '../../src/modules/cds/strategies/paediatric-dosing.strategy';
import { AncFirstContactStrategy } from '../../src/modules/cds/strategies/anc-first-contact.strategy';
import { ImciDiarrhoeaUnder5Strategy } from '../../src/modules/cds/strategies/imci-diarrhoea-under5.strategy';
import { ImciPneumoniaUnder5Strategy } from '../../src/modules/cds/strategies/imci-pneumonia-under5.strategy';
import { ImciMalariaUnder5Strategy } from '../../src/modules/cds/strategies/imci-malaria-under5.strategy';
import { ImciMalnutritionUnder5Strategy } from '../../src/modules/cds/strategies/imci-malnutrition-under5.strategy';
import { PenCvdRiskStrategy } from '../../src/modules/cds/strategies/pen-cvd-risk.strategy';
import { AdultCapCrb65Strategy } from '../../src/modules/cds/strategies/adult-cap-crb65.strategy';
import { AdultAcsRecognitionStrategy } from '../../src/modules/cds/strategies/adult-acs-recognition.strategy';
import { AdultMalariaStrategy } from '../../src/modules/cds/strategies/adult-malaria.strategy';
import { AncPreeclampsiaScreenStrategy } from '../../src/modules/cds/strategies/anc-preeclampsia-screen.strategy';
import { AncPphRiskScreenStrategy } from '../../src/modules/cds/strategies/anc-pph-risk-screen.strategy';
import { TbSymptomScreenStrategy } from '../../src/modules/cds/strategies/tb-symptom-screen.strategy';
import { Phq9DepressionScreenStrategy } from '../../src/modules/cds/strategies/phq9-depression-screen.strategy';
import { Gad7AnxietyScreenStrategy } from '../../src/modules/cds/strategies/gad7-anxiety-screen.strategy';
import { CageAidSubstanceScreenStrategy } from '../../src/modules/cds/strategies/cage-aid-substance-screen.strategy';
import { MhgapPsychosisScreenStrategy } from '../../src/modules/cds/strategies/mhgap-psychosis-screen.strategy';
import { HivPitcTriggerStrategy } from '../../src/modules/cds/strategies/hiv-pitc-trigger.strategy';
import { ImciYoungInfantStrategy } from '../../src/modules/cds/strategies/imci-young-infant.strategy';
import { StrokeFastRecognitionStrategy } from '../../src/modules/cds/strategies/stroke-fast-recognition.strategy';
import { SepsisQSofaStrategy } from '../../src/modules/cds/strategies/sepsis-qsofa.strategy';
import { CopdExacerbationStrategy } from '../../src/modules/cds/strategies/copd-exacerbation.strategy';
import { AnaphylaxisRecognitionStrategy } from '../../src/modules/cds/strategies/anaphylaxis-recognition.strategy';
import { DkaRecognitionStrategy } from '../../src/modules/cds/strategies/dka-recognition.strategy';
import { SevereAsthmaExacerbationStrategy } from '../../src/modules/cds/strategies/severe-asthma-exacerbation.strategy';
import { SnakeBiteTriageStrategy } from '../../src/modules/cds/strategies/snake-bite-triage.strategy';
import { SyphilisScreenStrategy } from '../../src/modules/cds/strategies/syphilis-screen.strategy';
import { HeartFailureDecompensationStrategy } from '../../src/modules/cds/strategies/heart-failure-decompensation.strategy';
import { ViralHepatitisScreenStrategy } from '../../src/modules/cds/strategies/viral-hepatitis-screen.strategy';
import { StiSyndromicStrategy } from '../../src/modules/cds/strategies/sti-syndromic.strategy';
import { GdmScreenStrategy } from '../../src/modules/cds/strategies/gdm-screen.strategy';
import { StatusEpilepticusStrategy } from '../../src/modules/cds/strategies/status-epilepticus.strategy';
import { ImciMeaslesStrategy } from '../../src/modules/cds/strategies/imci-measles.strategy';
import { PmtctStrategy } from '../../src/modules/cds/strategies/pmtct.strategy';
import { PostpartumCareStrategy } from '../../src/modules/cds/strategies/postpartum-care.strategy';
import { CkdScreenStrategy } from '../../src/modules/cds/strategies/ckd-screen.strategy';
import { HeadInjuryTriageStrategy } from '../../src/modules/cds/strategies/head-injury-triage.strategy';
import { HhsRecognitionStrategy } from '../../src/modules/cds/strategies/hhs-recognition.strategy';
import { TbTreatmentStrategy } from '../../src/modules/cds/strategies/tb-treatment.strategy';
import { RabiesPepStrategy } from '../../src/modules/cds/strategies/rabies-pep.strategy';
import { NeonatalJaundiceStrategy } from '../../src/modules/cds/strategies/neonatal-jaundice.strategy';
import { SickleCellCrisisStrategy } from '../../src/modules/cds/strategies/sickle-cell-crisis.strategy';
import { DengueArboviralStrategy } from '../../src/modules/cds/strategies/dengue-arboviral.strategy';
import { SchistosomiasisTreatmentStrategy } from '../../src/modules/cds/strategies/schistosomiasis-treatment.strategy';
import { ImciEarInfectionStrategy } from '../../src/modules/cds/strategies/imci-ear-infection.strategy';
import { NeonatalSepsisStrategy } from '../../src/modules/cds/strategies/neonatal-sepsis.strategy';
import { HeatStrokeStrategy } from '../../src/modules/cds/strategies/heat-stroke.strategy';
import { AfibAnticoagulationStrategy } from '../../src/modules/cds/strategies/afib-anticoagulation.strategy';
import { UgibBlatchfordStrategy } from '../../src/modules/cds/strategies/ugib-blatchford.strategy';
import { VteProphylaxisStrategy } from '../../src/modules/cds/strategies/vte-prophylaxis.strategy';
import { CiwaArStrategy } from '../../src/modules/cds/strategies/ciwa-ar.strategy';
import { PneumoniaCurb65Strategy } from '../../src/modules/cds/strategies/pneumonia-curb65.strategy';
import { StemiFibrinolysisStrategy } from '../../src/modules/cds/strategies/stemi-fibrinolysis.strategy';
import { HivPepStrategy } from '../../src/modules/cds/strategies/hiv-pep.strategy';
import { HivArtFirstLineStrategy } from '../../src/modules/cds/strategies/hiv-art-first-line.strategy';
import { MdrTbRegimenStrategy } from '../../src/modules/cds/strategies/mdr-tb-regimen.strategy';
import { CryptococcalInductionStrategy } from '../../src/modules/cds/strategies/cryptococcal-induction.strategy';
import { SnakeEnvenomationTreatmentStrategy } from '../../src/modules/cds/strategies/snake-envenomation-treatment.strategy';
import { UtiTreatmentStrategy } from '../../src/modules/cds/strategies/uti-treatment.strategy';
import { AsthmaStepUpStrategy } from '../../src/modules/cds/strategies/asthma-step-up.strategy';
import { AnaemiaIronReplacementStrategy } from '../../src/modules/cds/strategies/anaemia-iron-replacement.strategy';
import { HypothyroidismInitStrategy } from '../../src/modules/cds/strategies/hypothyroidism-init.strategy';
import { VhfSuspectedIsolationStrategy } from '../../src/modules/cds/strategies/vhf-suspected-isolation.strategy';
import { BundleOutcomeStrategy } from '../../src/modules/cds/strategies/bundle-outcome.strategy';
import { PhiFreeLogger } from '../../src/common/phi-free-logger';
import type { AppConfig } from '../../src/config/configuration';
import { makeKnowledgeService } from './knowledge';

export function makeCdsService(): CdsService {
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
  const allergy = new AllergyService(knowledge);
  allergy.onModuleInit();
  const drugs = new DrugsService(knowledge, allergy);
  drugs.onModuleInit();
  const hepatic = new HepaticDoseService(knowledge);
  hepatic.onModuleInit();
  const registry = new CdsStrategyRegistry(
    new DrugDrugInteractionStrategy(drugs),
    new DrugAllergyCrossReactivityStrategy(drugs, allergy),
    new RenalSafetyStrategy(drugs),
    new HepaticSafetyStrategy(hepatic),
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
    new VhfSuspectedIsolationStrategy(),
    new BundleOutcomeStrategy(),
  );
  const normalizer = new CdsNormalizerService(knowledge, drugs);
  normalizer.rebuildIndex();
  return new CdsService(config, log, knowledge, registry, normalizer);
}
