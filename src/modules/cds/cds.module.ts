import { Module } from '@nestjs/common';
import { CdsHooksController } from './cds-hooks.controller';
import { CdsEvaluateController } from './cds-evaluate.controller';
import { CdsCapabilityController } from './cds-capability.controller';
import { CdsService } from './cds.service';
import { CdsStrategyRegistry } from './strategies/registry';
import { DrugDrugInteractionStrategy } from './strategies/ddi.strategy';
import { RenalSafetyStrategy } from './strategies/renal-safety.strategy';
import { PregnancySafetyStrategy } from './strategies/pregnancy-safety.strategy';
import { AwareStewardshipStrategy } from './strategies/aware-stewardship.strategy';
import { MedicationMonitoringStrategy } from './strategies/medication-monitoring.strategy';
import { ImciFeverUnder5Strategy } from './strategies/imci-fever-under5.strategy';
import { PenHypertensionScreenStrategy } from './strategies/pen-hypertension-screen.strategy';
import { PenDiabetesScreenStrategy } from './strategies/pen-diabetes-screen.strategy';
import { PaediatricDosingStrategy } from './strategies/paediatric-dosing.strategy';
import { AncFirstContactStrategy } from './strategies/anc-first-contact.strategy';
import { ImciDiarrhoeaUnder5Strategy } from './strategies/imci-diarrhoea-under5.strategy';
import { ImciPneumoniaUnder5Strategy } from './strategies/imci-pneumonia-under5.strategy';
import { ImciMalariaUnder5Strategy } from './strategies/imci-malaria-under5.strategy';
import { ImciMalnutritionUnder5Strategy } from './strategies/imci-malnutrition-under5.strategy';
import { PenCvdRiskStrategy } from './strategies/pen-cvd-risk.strategy';
import { TbSymptomScreenStrategy } from './strategies/tb-symptom-screen.strategy';
import { AncPreeclampsiaScreenStrategy } from './strategies/anc-preeclampsia-screen.strategy';
import { AncPphRiskScreenStrategy } from './strategies/anc-pph-risk-screen.strategy';
import { AdultCapCrb65Strategy } from './strategies/adult-cap-crb65.strategy';
import { AdultAcsRecognitionStrategy } from './strategies/adult-acs-recognition.strategy';
import { AdultMalariaStrategy } from './strategies/adult-malaria.strategy';
import { Phq9DepressionScreenStrategy } from './strategies/phq9-depression-screen.strategy';
import { Gad7AnxietyScreenStrategy } from './strategies/gad7-anxiety-screen.strategy';
import { CageAidSubstanceScreenStrategy } from './strategies/cage-aid-substance-screen.strategy';
import { MhgapPsychosisScreenStrategy } from './strategies/mhgap-psychosis-screen.strategy';
import { HivPitcTriggerStrategy } from './strategies/hiv-pitc-trigger.strategy';
import { ImciYoungInfantStrategy } from './strategies/imci-young-infant.strategy';
import { StrokeFastRecognitionStrategy } from './strategies/stroke-fast-recognition.strategy';
import { SepsisQSofaStrategy } from './strategies/sepsis-qsofa.strategy';
import { CopdExacerbationStrategy } from './strategies/copd-exacerbation.strategy';
import { AnaphylaxisRecognitionStrategy } from './strategies/anaphylaxis-recognition.strategy';
import { DkaRecognitionStrategy } from './strategies/dka-recognition.strategy';
import { SevereAsthmaExacerbationStrategy } from './strategies/severe-asthma-exacerbation.strategy';
import { SnakeBiteTriageStrategy } from './strategies/snake-bite-triage.strategy';
import { SyphilisScreenStrategy } from './strategies/syphilis-screen.strategy';
import { HeartFailureDecompensationStrategy } from './strategies/heart-failure-decompensation.strategy';
import { ViralHepatitisScreenStrategy } from './strategies/viral-hepatitis-screen.strategy';
import { StiSyndromicStrategy } from './strategies/sti-syndromic.strategy';
import { GdmScreenStrategy } from './strategies/gdm-screen.strategy';
import { StatusEpilepticusStrategy } from './strategies/status-epilepticus.strategy';
import { ImciMeaslesStrategy } from './strategies/imci-measles.strategy';
import { PmtctStrategy } from './strategies/pmtct.strategy';
import { PostpartumCareStrategy } from './strategies/postpartum-care.strategy';
import { CkdScreenStrategy } from './strategies/ckd-screen.strategy';
import { HeadInjuryTriageStrategy } from './strategies/head-injury-triage.strategy';
import { HhsRecognitionStrategy } from './strategies/hhs-recognition.strategy';
import { TbTreatmentStrategy } from './strategies/tb-treatment.strategy';
import { RabiesPepStrategy } from './strategies/rabies-pep.strategy';
import { NeonatalJaundiceStrategy } from './strategies/neonatal-jaundice.strategy';
import { SickleCellCrisisStrategy } from './strategies/sickle-cell-crisis.strategy';
import { DengueArboviralStrategy } from './strategies/dengue-arboviral.strategy';
import { SchistosomiasisTreatmentStrategy } from './strategies/schistosomiasis-treatment.strategy';
import { ImciEarInfectionStrategy } from './strategies/imci-ear-infection.strategy';
import { NeonatalSepsisStrategy } from './strategies/neonatal-sepsis.strategy';
import { HeatStrokeStrategy } from './strategies/heat-stroke.strategy';
import { AfibAnticoagulationStrategy } from './strategies/afib-anticoagulation.strategy';
import { UgibBlatchfordStrategy } from './strategies/ugib-blatchford.strategy';
import { VteProphylaxisStrategy } from './strategies/vte-prophylaxis.strategy';
import { CiwaArStrategy } from './strategies/ciwa-ar.strategy';
import { PneumoniaCurb65Strategy } from './strategies/pneumonia-curb65.strategy';
import { StemiFibrinolysisStrategy } from './strategies/stemi-fibrinolysis.strategy';
import { HivPepStrategy } from './strategies/hiv-pep.strategy';
import { HivArtFirstLineStrategy } from './strategies/hiv-art-first-line.strategy';
import { MdrTbRegimenStrategy } from './strategies/mdr-tb-regimen.strategy';
import { CryptococcalInductionStrategy } from './strategies/cryptococcal-induction.strategy';
import { SnakeEnvenomationTreatmentStrategy } from './strategies/snake-envenomation-treatment.strategy';
import { UtiTreatmentStrategy } from './strategies/uti-treatment.strategy';
import { AsthmaStepUpStrategy } from './strategies/asthma-step-up.strategy';
import { AnaemiaIronReplacementStrategy } from './strategies/anaemia-iron-replacement.strategy';
import { HypothyroidismInitStrategy } from './strategies/hypothyroidism-init.strategy';
import { DeveloperModule } from '../developer/developer.module';
import { DrugsModule } from '../drugs/drugs.module';

@Module({
  imports: [DeveloperModule, DrugsModule],
  controllers: [CdsHooksController, CdsEvaluateController, CdsCapabilityController],
  providers: [
    CdsService,
    CdsStrategyRegistry,
    DrugDrugInteractionStrategy,
    RenalSafetyStrategy,
    PregnancySafetyStrategy,
    AwareStewardshipStrategy,
    MedicationMonitoringStrategy,
    ImciFeverUnder5Strategy,
    ImciDiarrhoeaUnder5Strategy,
    ImciPneumoniaUnder5Strategy,
    ImciMalariaUnder5Strategy,
    ImciMalnutritionUnder5Strategy,
    ImciYoungInfantStrategy,
    PenHypertensionScreenStrategy,
    PenDiabetesScreenStrategy,
    PenCvdRiskStrategy,
    PaediatricDosingStrategy,
    AdultCapCrb65Strategy,
    AdultAcsRecognitionStrategy,
    AdultMalariaStrategy,
    AncFirstContactStrategy,
    AncPreeclampsiaScreenStrategy,
    AncPphRiskScreenStrategy,
    TbSymptomScreenStrategy,
    Phq9DepressionScreenStrategy,
    Gad7AnxietyScreenStrategy,
    CageAidSubstanceScreenStrategy,
    MhgapPsychosisScreenStrategy,
    HivPitcTriggerStrategy,
    StrokeFastRecognitionStrategy,
    SepsisQSofaStrategy,
    CopdExacerbationStrategy,
    AnaphylaxisRecognitionStrategy,
    DkaRecognitionStrategy,
    SevereAsthmaExacerbationStrategy,
    SnakeBiteTriageStrategy,
    SyphilisScreenStrategy,
    HeartFailureDecompensationStrategy,
    ViralHepatitisScreenStrategy,
    StiSyndromicStrategy,
    GdmScreenStrategy,
    StatusEpilepticusStrategy,
    ImciMeaslesStrategy,
    PmtctStrategy,
    PostpartumCareStrategy,
    CkdScreenStrategy,
    HeadInjuryTriageStrategy,
    HhsRecognitionStrategy,
    TbTreatmentStrategy,
    RabiesPepStrategy,
    NeonatalJaundiceStrategy,
    SickleCellCrisisStrategy,
    DengueArboviralStrategy,
    SchistosomiasisTreatmentStrategy,
    ImciEarInfectionStrategy,
    NeonatalSepsisStrategy,
    HeatStrokeStrategy,
    AfibAnticoagulationStrategy,
    UgibBlatchfordStrategy,
    VteProphylaxisStrategy,
    CiwaArStrategy,
    PneumoniaCurb65Strategy,
    StemiFibrinolysisStrategy,
    HivPepStrategy,
    HivArtFirstLineStrategy,
    MdrTbRegimenStrategy,
    CryptococcalInductionStrategy,
    SnakeEnvenomationTreatmentStrategy,
    UtiTreatmentStrategy,
    AsthmaStepUpStrategy,
    AnaemiaIronReplacementStrategy,
    HypothyroidismInitStrategy,
  ],
  exports: [CdsService],
})
export class CdsModule {}
