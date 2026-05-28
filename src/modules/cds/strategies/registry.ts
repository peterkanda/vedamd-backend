import { Injectable } from '@nestjs/common';
import { AwareStewardshipStrategy } from './aware-stewardship.strategy';
import { DrugDrugInteractionStrategy } from './ddi.strategy';
import { AdultAcsRecognitionStrategy } from './adult-acs-recognition.strategy';
import { AdultCapCrb65Strategy } from './adult-cap-crb65.strategy';
import { AdultMalariaStrategy } from './adult-malaria.strategy';
import { AnaphylaxisRecognitionStrategy } from './anaphylaxis-recognition.strategy';
import { AncFirstContactStrategy } from './anc-first-contact.strategy';
import { AncPphRiskScreenStrategy } from './anc-pph-risk-screen.strategy';
import { AncPreeclampsiaScreenStrategy } from './anc-preeclampsia-screen.strategy';
import { CageAidSubstanceScreenStrategy } from './cage-aid-substance-screen.strategy';
import { CopdExacerbationStrategy } from './copd-exacerbation.strategy';
import { DkaRecognitionStrategy } from './dka-recognition.strategy';
import { Gad7AnxietyScreenStrategy } from './gad7-anxiety-screen.strategy';
import { HivPitcTriggerStrategy } from './hiv-pitc-trigger.strategy';
import { ImciDiarrhoeaUnder5Strategy } from './imci-diarrhoea-under5.strategy';
import { ImciFeverUnder5Strategy } from './imci-fever-under5.strategy';
import { ImciMalariaUnder5Strategy } from './imci-malaria-under5.strategy';
import { ImciMalnutritionUnder5Strategy } from './imci-malnutrition-under5.strategy';
import { ImciPneumoniaUnder5Strategy } from './imci-pneumonia-under5.strategy';
import { ImciYoungInfantStrategy } from './imci-young-infant.strategy';
import { MedicationMonitoringStrategy } from './medication-monitoring.strategy';
import { MhgapPsychosisScreenStrategy } from './mhgap-psychosis-screen.strategy';
import { PaediatricDosingStrategy } from './paediatric-dosing.strategy';
import { PenCvdRiskStrategy } from './pen-cvd-risk.strategy';
import { PenDiabetesScreenStrategy } from './pen-diabetes-screen.strategy';
import { PenHypertensionScreenStrategy } from './pen-hypertension-screen.strategy';
import { Phq9DepressionScreenStrategy } from './phq9-depression-screen.strategy';
import { PregnancySafetyStrategy } from './pregnancy-safety.strategy';
import { RenalSafetyStrategy } from './renal-safety.strategy';
import { SepsisQSofaStrategy } from './sepsis-qsofa.strategy';
import { SevereAsthmaExacerbationStrategy } from './severe-asthma-exacerbation.strategy';
import { SnakeBiteTriageStrategy } from './snake-bite-triage.strategy';
import { StrokeFastRecognitionStrategy } from './stroke-fast-recognition.strategy';
import { SyphilisScreenStrategy } from './syphilis-screen.strategy';
import { HeartFailureDecompensationStrategy } from './heart-failure-decompensation.strategy';
import { ViralHepatitisScreenStrategy } from './viral-hepatitis-screen.strategy';
import { StiSyndromicStrategy } from './sti-syndromic.strategy';
import { GdmScreenStrategy } from './gdm-screen.strategy';
import { StatusEpilepticusStrategy } from './status-epilepticus.strategy';
import { ImciMeaslesStrategy } from './imci-measles.strategy';
import { PmtctStrategy } from './pmtct.strategy';
import { PostpartumCareStrategy } from './postpartum-care.strategy';
import { CkdScreenStrategy } from './ckd-screen.strategy';
import { HeadInjuryTriageStrategy } from './head-injury-triage.strategy';
import { HhsRecognitionStrategy } from './hhs-recognition.strategy';
import { TbTreatmentStrategy } from './tb-treatment.strategy';
import { RabiesPepStrategy } from './rabies-pep.strategy';
import { NeonatalJaundiceStrategy } from './neonatal-jaundice.strategy';
import { SickleCellCrisisStrategy } from './sickle-cell-crisis.strategy';
import { DengueArboviralStrategy } from './dengue-arboviral.strategy';
import { SchistosomiasisTreatmentStrategy } from './schistosomiasis-treatment.strategy';
import { ImciEarInfectionStrategy } from './imci-ear-infection.strategy';
import { NeonatalSepsisStrategy } from './neonatal-sepsis.strategy';
import { HeatStrokeStrategy } from './heat-stroke.strategy';
import { TbSymptomScreenStrategy } from './tb-symptom-screen.strategy';
import { AfibAnticoagulationStrategy } from './afib-anticoagulation.strategy';
import { UgibBlatchfordStrategy } from './ugib-blatchford.strategy';
import { VteProphylaxisStrategy } from './vte-prophylaxis.strategy';
import { CiwaArStrategy } from './ciwa-ar.strategy';
import { PneumoniaCurb65Strategy } from './pneumonia-curb65.strategy';
import { StemiFibrinolysisStrategy } from './stemi-fibrinolysis.strategy';
import { HivPepStrategy } from './hiv-pep.strategy';
import { HivArtFirstLineStrategy } from './hiv-art-first-line.strategy';
import { MdrTbRegimenStrategy } from './mdr-tb-regimen.strategy';
import { CryptococcalInductionStrategy } from './cryptococcal-induction.strategy';
import { SnakeEnvenomationTreatmentStrategy } from './snake-envenomation-treatment.strategy';
import { UtiTreatmentStrategy } from './uti-treatment.strategy';
import { AsthmaStepUpStrategy } from './asthma-step-up.strategy';
import { AnaemiaIronReplacementStrategy } from './anaemia-iron-replacement.strategy';
import { HypothyroidismInitStrategy } from './hypothyroidism-init.strategy';
import { VhfSuspectedIsolationStrategy } from './vhf-suspected-isolation.strategy';
import { BundleOutcomeStrategy } from './bundle-outcome.strategy';
import type { CdsRuleStrategy } from './types';

/**
 * Registry of all implemented rule strategies, keyed by CdsRule.type.
 * Rules in the bundle whose type isn't registered are silently
 * skipped at evaluation time (and reported via PHI-free log).
 */
@Injectable()
export class CdsStrategyRegistry {
  private readonly byType = new Map<string, CdsRuleStrategy>();

  constructor(
    ddi: DrugDrugInteractionStrategy,
    renal: RenalSafetyStrategy,
    pregnancy: PregnancySafetyStrategy,
    aware: AwareStewardshipStrategy,
    monitoring: MedicationMonitoringStrategy,
    imciFever: ImciFeverUnder5Strategy,
    imciDiarrhoea: ImciDiarrhoeaUnder5Strategy,
    imciPneumonia: ImciPneumoniaUnder5Strategy,
    imciMalaria: ImciMalariaUnder5Strategy,
    imciMalnutrition: ImciMalnutritionUnder5Strategy,
    imciYoungInfant: ImciYoungInfantStrategy,
    penHtn: PenHypertensionScreenStrategy,
    penDm: PenDiabetesScreenStrategy,
    penCvd: PenCvdRiskStrategy,
    paedDose: PaediatricDosingStrategy,
    adultCap: AdultCapCrb65Strategy,
    adultAcs: AdultAcsRecognitionStrategy,
    adultMalaria: AdultMalariaStrategy,
    ancFirstContact: AncFirstContactStrategy,
    ancPreEcl: AncPreeclampsiaScreenStrategy,
    ancPph: AncPphRiskScreenStrategy,
    tbScreen: TbSymptomScreenStrategy,
    phq9: Phq9DepressionScreenStrategy,
    gad7: Gad7AnxietyScreenStrategy,
    cageAid: CageAidSubstanceScreenStrategy,
    psychosis: MhgapPsychosisScreenStrategy,
    hivPitc: HivPitcTriggerStrategy,
    strokeFast: StrokeFastRecognitionStrategy,
    sepsis: SepsisQSofaStrategy,
    copd: CopdExacerbationStrategy,
    anaphylaxis: AnaphylaxisRecognitionStrategy,
    dka: DkaRecognitionStrategy,
    severeAsthma: SevereAsthmaExacerbationStrategy,
    snakeBite: SnakeBiteTriageStrategy,
    syphilis: SyphilisScreenStrategy,
    heartFailure: HeartFailureDecompensationStrategy,
    viralHepatitis: ViralHepatitisScreenStrategy,
    stiSyndromic: StiSyndromicStrategy,
    gdmScreen: GdmScreenStrategy,
    statusEpilepticus: StatusEpilepticusStrategy,
    imciMeasles: ImciMeaslesStrategy,
    pmtct: PmtctStrategy,
    postpartumCare: PostpartumCareStrategy,
    ckdScreen: CkdScreenStrategy,
    headInjury: HeadInjuryTriageStrategy,
    hhs: HhsRecognitionStrategy,
    tbTreatment: TbTreatmentStrategy,
    rabiesPep: RabiesPepStrategy,
    neonatalJaundice: NeonatalJaundiceStrategy,
    sickleCell: SickleCellCrisisStrategy,
    dengue: DengueArboviralStrategy,
    schisto: SchistosomiasisTreatmentStrategy,
    earInfection: ImciEarInfectionStrategy,
    neonatalSepsis: NeonatalSepsisStrategy,
    heatStroke: HeatStrokeStrategy,
    afibAnticoag: AfibAnticoagulationStrategy,
    ugibBlatchford: UgibBlatchfordStrategy,
    vteProphylaxis: VteProphylaxisStrategy,
    ciwaAr: CiwaArStrategy,
    pneumoniaCurb65: PneumoniaCurb65Strategy,
    stemiFibrinolysis: StemiFibrinolysisStrategy,
    hivPep: HivPepStrategy,
    hivArtFirstLine: HivArtFirstLineStrategy,
    mdrTbRegimen: MdrTbRegimenStrategy,
    cryptococcalInduction: CryptococcalInductionStrategy,
    snakeEnvenomationTreatment: SnakeEnvenomationTreatmentStrategy,
    utiTreatment: UtiTreatmentStrategy,
    asthmaStepUp: AsthmaStepUpStrategy,
    anaemiaIron: AnaemiaIronReplacementStrategy,
    hypothyroidismInit: HypothyroidismInitStrategy,
    vhfSuspectedIsolation: VhfSuspectedIsolationStrategy,
    private readonly bundleOutcome: BundleOutcomeStrategy,
  ) {
    this.register(ddi);
    this.register(renal);
    this.register(pregnancy);
    this.register(aware);
    this.register(monitoring);
    this.register(imciFever);
    this.register(imciDiarrhoea);
    this.register(imciPneumonia);
    this.register(imciMalaria);
    this.register(imciMalnutrition);
    this.register(imciYoungInfant);
    this.register(penHtn);
    this.register(penDm);
    this.register(penCvd);
    this.register(paedDose);
    this.register(adultCap);
    this.register(adultAcs);
    this.register(adultMalaria);
    this.register(ancFirstContact);
    this.register(ancPreEcl);
    this.register(ancPph);
    this.register(tbScreen);
    this.register(phq9);
    this.register(gad7);
    this.register(cageAid);
    this.register(psychosis);
    this.register(hivPitc);
    this.register(strokeFast);
    this.register(sepsis);
    this.register(copd);
    this.register(anaphylaxis);
    this.register(dka);
    this.register(severeAsthma);
    this.register(snakeBite);
    this.register(syphilis);
    this.register(heartFailure);
    this.register(viralHepatitis);
    this.register(stiSyndromic);
    this.register(gdmScreen);
    this.register(statusEpilepticus);
    this.register(imciMeasles);
    this.register(pmtct);
    this.register(postpartumCare);
    this.register(ckdScreen);
    this.register(headInjury);
    this.register(hhs);
    this.register(tbTreatment);
    this.register(rabiesPep);
    this.register(neonatalJaundice);
    this.register(sickleCell);
    this.register(dengue);
    this.register(schisto);
    this.register(earInfection);
    this.register(neonatalSepsis);
    this.register(heatStroke);
    this.register(afibAnticoag);
    this.register(ugibBlatchford);
    this.register(vteProphylaxis);
    this.register(ciwaAr);
    this.register(pneumoniaCurb65);
    this.register(stemiFibrinolysis);
    this.register(hivPep);
    this.register(hivArtFirstLine);
    this.register(mdrTbRegimen);
    this.register(cryptococcalInduction);
    this.register(snakeEnvenomationTreatment);
    this.register(utiTreatment);
    this.register(asthmaStepUp);
    this.register(anaemiaIron);
    this.register(hypothyroidismInit);
    this.register(vhfSuspectedIsolation);
  }

  register(s: CdsRuleStrategy): void {
    this.byType.set(s.type, s);
  }

  get(type: string | null | undefined): CdsRuleStrategy | null {
    if (type == null) return null;
    return this.byType.get(type) ?? null;
  }

  /** All bespoke strategy type keys (excludes the generic outcome fallback). */
  registeredTypes(): string[] {
    return [...this.byType.keys()];
  }

  /**
   * Generic renderer for content-only rules. CdsService uses it when
   * `get(rule.type)` is null but the rule carries `outcomes[]`, so a
   * rule whose declared type has no bespoke strategy still surfaces its
   * pre-written cards instead of being silently skipped.
   */
  outcomeFallback(): BundleOutcomeStrategy {
    return this.bundleOutcome;
  }
}
