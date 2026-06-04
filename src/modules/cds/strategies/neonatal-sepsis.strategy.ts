import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator, CodedReference } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Neonatal sepsis / Possible Serious Bacterial Infection (PSBI).
 *
 *   WHO Possible Serious Bacterial Infection in Young Infants (2015
 *   simplified antibiotic regimens for facility & community use),
 *   WHO Pocket Book of Hospital Care for Children (2nd edn 2013) +
 *   WHO Sepsis 2020 + Kenya MoH Newborn Care Guidelines (2014).
 *
 *   Sub-Saharan Africa: neonatal sepsis is among the top three causes
 *   of neonatal mortality. Two presentations:
 *
 *     EARLY-ONSET (< 72 h): vertical / intrapartum acquisition.
 *       Organisms: Group B Streptococcus, E. coli, Klebsiella,
 *       Staphylococcus aureus, Listeria.
 *     LATE-ONSET (≥ 72 h to 28 d): hospital or community-acquired.
 *       Organisms: as above + coagulase-negative staphylococci,
 *       enterococci, Gram-negative rods (MDR Klebsiella in some
 *       SSA NICUs).
 *
 *   Ladder:
 *     1. CRITICAL — Critical illness (PSBI) features:
 *        unable to feed since birth or stopped feeding, convulsions,
 *        movement only when stimulated, severe chest indrawing,
 *        fast breathing (RR ≥ 60), grunting, temperature ≥ 38 OR
 *        < 35.5, bulging fontanelle. Admit, full first-line IV /
 *        IM antibiotics (ampicillin + gentamicin), full sepsis
 *        screen.
 *
 *     2. CRITICAL — Clinical severe infection (CSI), can be managed
 *        by community/outpatient WHO 2015 simplified regimens when
 *        referral is not possible:
 *        only one of: fast breathing OR temperature 38–39 OR severe
 *        chest indrawing — IM gentamicin once daily for 7 days +
 *        oral amoxicillin twice daily for 7 days at home with daily
 *        follow-up.
 *
 *     3. CRITICAL — Suspected meningitis (any: full fontanelle,
 *        convulsions in neonate, neck stiffness, opisthotonus,
 *        movement-only-when-stimulated): add IV ceftriaxone /
 *        cefotaxime, send lumbar puncture (when stable).
 *
 *     4. WARNING — Risk-factor screen positive in well infant:
 *        maternal chorioamnionitis, PROM > 18 h, intrapartum fever,
 *        GBS positive without intrapartum prophylaxis, prematurity
 *        < 35 weeks — admit for 48 h observation + culture-driven
 *        antibiotic decision.
 *
 *     5. INFO — well infant with no risk factors: routine PNC.
 *
 *   Anonymous context:
 *     suspectedNeonatalSepsis        boolean (sentinel)
 *     ageHours                       number (postnatal age — 0..672)
 *     gestationalAgeWeeks            number
 *     weightKg                       number (paediatric dose)
 *     temperatureC                   number (optional)
 *     respiratoryRatePerMin          number (optional)
 *     severeChestIndrawing           boolean
 *     grunting                       boolean
 *     bulgingFontanelle              boolean
 *     unableToFeedSinceBirth         boolean
 *     stoppedFeeding                 boolean
 *     convulsions                    boolean
 *     movementOnlyWhenStimulated     boolean
 *     neckStiffness                  boolean
 *     maternalChorioamnionitis       boolean
 *     prolongedRomHours              number (optional, > 18 = PROM)
 *     intrapartumFever               boolean
 *     gbsPositiveNoIap               boolean
 *     prematurity                    boolean (< 35 weeks)
 *     referralPossible               boolean (for WHO 2015 PSBI flow)
 */

const NEONATAL_TACHYPNOEA_RR = 60;
const NEONATAL_FEVER_C = 38;
const NEONATAL_HYPOTHERMIA_C = 35.5;
const PSBI_AGE_HOURS_MAX = 28 * 24;
const EARLY_ONSET_THRESHOLD_HOURS = 72;

interface NeonatalSepsisContext {
  suspectedNeonatalSepsis?: boolean;
  ageHours?: number;
  gestationalAgeWeeks?: number;
  weightKg?: number;
  temperatureC?: number;
  respiratoryRatePerMin?: number;
  severeChestIndrawing?: boolean;
  grunting?: boolean;
  bulgingFontanelle?: boolean;
  unableToFeedSinceBirth?: boolean;
  stoppedFeeding?: boolean;
  convulsions?: boolean;
  movementOnlyWhenStimulated?: boolean;
  neckStiffness?: boolean;
  maternalChorioamnionitis?: boolean;
  prolongedRomHours?: number;
  intrapartumFever?: boolean;
  gbsPositiveNoIap?: boolean;
  prematurity?: boolean;
  referralPossible?: boolean;
}

const CODINGS_PSBI: CodedReference[] = [
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'P36', display: 'Bacterial sepsis of newborn', kind: 'diagnosis' },
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'P39', display: 'Other infections specific to the perinatal period', kind: 'diagnosis' },
  { system: 'http://id.who.int/icd/release/11/mms', code: 'KA60', display: 'Bacterial sepsis of the newborn', kind: 'diagnosis' },
  { system: 'http://snomed.info/sct', code: '206378007', display: 'Sepsis of the newborn (disorder)', kind: 'diagnosis' },
  { system: 'http://whocc.no/atc', code: 'J01CA01', display: 'Ampicillin', kind: 'drug' },
  { system: 'http://whocc.no/atc', code: 'J01GB03', display: 'Gentamicin', kind: 'drug' },
  { system: 'http://whocc.no/atc', code: 'J01DD04', display: 'Ceftriaxone', kind: 'drug' },
];

function ampDoseMg(wt?: number): string {
  if (typeof wt !== 'number') return 'ampicillin 50 mg/kg IV / IM every 12 h (week 1) or every 8 h (week 2+)';
  return `ampicillin ${(50 * wt).toFixed(0)} mg IV / IM every 12 h (week 1) or every 8 h (week 2+)`;
}

function gentDoseMg(wt?: number, ageHours?: number): string {
  if (typeof wt !== 'number') {
    return 'gentamicin 5 mg/kg IM / IV once daily (4 mg/kg if < 32 weeks)';
  }
  const mgKg = typeof ageHours === 'number' && ageHours <= 168 ? 5 : 7.5; // simplified
  return `gentamicin ${(mgKg * wt).toFixed(1)} mg IM / IV once daily (${mgKg} mg/kg × ${wt} kg)`;
}

function ceftriaxoneDose(wt?: number): string {
  if (typeof wt !== 'number') return 'ceftriaxone 50 mg/kg IV / IM once daily (caution in jaundiced or premature neonates — use cefotaxime 50 mg/kg every 8 h instead)';
  return `ceftriaxone ${(50 * wt).toFixed(0)} mg IV / IM once daily; if jaundiced / premature → cefotaxime ${(50 * wt).toFixed(0)} mg IV every 8 h instead`;
}

@Injectable()
export class NeonatalSepsisStrategy implements CdsRuleStrategy {
  readonly type = 'neonatal-sepsis';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as NeonatalSepsisContext;
    if (ctx.suspectedNeonatalSepsis !== true) return [];
    if (typeof ctx.ageHours !== 'number' || ctx.ageHours < 0 || ctx.ageHours > PSBI_AGE_HOURS_MAX) {
      return [];
    }

    // Critical illness (full PSBI).
    const criticalFeatures: string[] = [];
    if (ctx.unableToFeedSinceBirth === true) criticalFeatures.push('unable to feed since birth');
    if (ctx.stoppedFeeding === true) criticalFeatures.push('stopped feeding');
    if (ctx.convulsions === true) criticalFeatures.push('convulsions');
    if (ctx.movementOnlyWhenStimulated === true) {
      criticalFeatures.push('movement only when stimulated (lethargy)');
    }
    if (ctx.severeChestIndrawing === true) criticalFeatures.push('severe chest indrawing');
    if (ctx.grunting === true) criticalFeatures.push('grunting');
    if (typeof ctx.respiratoryRatePerMin === 'number' && ctx.respiratoryRatePerMin >= NEONATAL_TACHYPNOEA_RR) {
      criticalFeatures.push(`RR ${ctx.respiratoryRatePerMin}/min (≥ ${NEONATAL_TACHYPNOEA_RR})`);
    }
    if (typeof ctx.temperatureC === 'number' && ctx.temperatureC >= NEONATAL_FEVER_C) {
      criticalFeatures.push(`temperature ${ctx.temperatureC.toFixed(1)} °C (≥ ${NEONATAL_FEVER_C})`);
    }
    if (typeof ctx.temperatureC === 'number' && ctx.temperatureC < NEONATAL_HYPOTHERMIA_C) {
      criticalFeatures.push(`hypothermia ${ctx.temperatureC.toFixed(1)} °C (< ${NEONATAL_HYPOTHERMIA_C})`);
    }
    if (ctx.bulgingFontanelle === true) criticalFeatures.push('bulging fontanelle');
    if (ctx.neckStiffness === true) criticalFeatures.push('neck stiffness');

    if (criticalFeatures.length > 0) {
      return [this.criticalCard(rule, req, ctx, criticalFeatures)];
    }

    // Risk-factor screen positive in well infant.
    const riskFactors: string[] = [];
    if (ctx.maternalChorioamnionitis === true) riskFactors.push('maternal chorioamnionitis');
    if (typeof ctx.prolongedRomHours === 'number' && ctx.prolongedRomHours > 18) {
      riskFactors.push(`prolonged ROM ${ctx.prolongedRomHours} h (> 18)`);
    }
    if (ctx.intrapartumFever === true) riskFactors.push('intrapartum fever');
    if (ctx.gbsPositiveNoIap === true) riskFactors.push('maternal GBS positive without intrapartum prophylaxis');
    if (ctx.prematurity === true) riskFactors.push('prematurity < 35 weeks');

    if (riskFactors.length > 0) {
      return [this.riskWatchCard(rule, req, ctx, riskFactors)];
    }

    return [
      this.buildCard(
        rule,
        req,
        'info',
        'Newborn well — no PSBI features, no risk markers',
        'No PSBI features (feeding well, no convulsions, normal movement, no severe chest indrawing, RR < 60, normothermic, soft ' +
          'fontanelle). Routine postnatal care: keep warm (skin-to-skin / kangaroo mother care), exclusive breastfeeding 8–12 times ' +
          'per 24 hours, cord care (chlorhexidine or dry cord care per protocol), BCG + oral polio at birth, vitamin K 1 mg IM ' +
          'within 1 hour of birth, counsel WHO danger signs for return (poor feeding, lethargy, fever, hypothermia, fast breathing, ' +
          'convulsions, severe chest indrawing).',
        {},
        CODINGS_PSBI,
      ),
    ];
  }

  private criticalCard(rule: CdsRule, req: CdsHookRequest, ctx: NeonatalSepsisContext, features: string[]): CdsCard {
    const earlyOnset = (ctx.ageHours ?? 0) < EARLY_ONSET_THRESHOLD_HOURS;
    const lpRequired =
      ctx.bulgingFontanelle === true || ctx.convulsions === true || ctx.neckStiffness === true || ctx.movementOnlyWhenStimulated === true;
    const meningitisLine = lpRequired
      ? ` Suspected meningitis — ADD ${ceftriaxoneDose(ctx.weightKg)} (or cefotaxime in the jaundiced / premature infant). Perform lumbar puncture WHEN the infant is haemodynamically stable; if unstable, do not delay antibiotics — culture-confirmed meningitis is treated for 14–21 days depending on organism.`
      : '';
    const referralLine =
      ctx.referralPossible === false
        ? ` Referral NOT possible — use the WHO 2015 simplified outpatient PSBI regimen ONLY if the carer can return daily for 7 days: ${gentDoseMg(ctx.weightKg, ctx.ageHours)} once daily IM for 7 days + oral amoxicillin 50 mg/kg twice daily for 7 days. Daily review for danger-sign deterioration → urgent referral.`
        : ' Refer to a facility with neonatal admission capacity within 1 hour.';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Possible Serious Bacterial Infection (PSBI) — first-line IV antibiotics within 1 hour',
      'Critical feature(s): {{features}}. Bundle (WHO Pocket Book + Kenya MoH): (1) Resuscitate — ABC, oxygen if SpO₂ < 90 % or ' +
        'cyanosis (target 90–95 % in term, 90–94 % in preterm), keep warm (skin-to-skin / radiant warmer / clothes + hat / kangaroo ' +
        'care), check blood glucose (give 2 mL/kg of 10 % dextrose IV / NG if < 2.6 mmol/L). (2) Antibiotics within 1 hour: ' +
        '{{amp}} PLUS {{gent}} for 10–14 days (longer for meningitis). {{meningitis}} (3) Investigations: blood culture (at least 1 ' +
        'mL), full blood count, CRP, glucose, urea / creatinine, urine sample for culture (suprapubic aspiration is preferred in ' +
        'young infants), CXR if respiratory features, lumbar puncture when stable. (4) Supportive: IV fluids at maintenance (~60 ' +
        'mL/kg/day on day 1, advancing 10–20 mL/kg/day), early enteral feeds (preferably expressed breast milk) as soon as ' +
        'tolerated. (5) {{referral}} (6) This is a sentinel event; ' +
        `presumed ${earlyOnset ? 'early-onset' : 'late-onset'} sepsis — note maternal GBS / chorioamnionitis / PROM in the chart; treat with the same regimen unless culture suggests otherwise.`,
      {
        features: features.join('; '),
        amp: ampDoseMg(ctx.weightKg),
        gent: gentDoseMg(ctx.weightKg, ctx.ageHours),
        meningitis: meningitisLine,
        referral: referralLine,
      },
      CODINGS_PSBI,
    );
  }

  private riskWatchCard(rule: CdsRule, req: CdsHookRequest, _ctx: NeonatalSepsisContext, riskFactors: string[]): CdsCard {
    return this.buildCard(
      rule,
      req,
      'warning',
      'Sepsis risk factor(s) in a well infant — admit for 48-h observation + screen',
      'Risk factor(s) present: {{factors}}. Admit for 48 hours of observation. Check vitals (temperature, RR, HR, SpO₂, perfusion, ' +
        'feeding) at least 4-hourly. Send a sepsis screen: full blood count + differential, CRP at 0 and 12 hours, blood culture, ' +
        'glucose. If CRP rises, infant deteriorates, or culture grows a pathogen, start empirical ampicillin + gentamicin (see ' +
        'WHO PSBI regimen). If 48-hour observation is normal AND cultures are negative, discharge with caregiver counselling and ' +
        'a planned day-7 review (WHO PNC schedule).',
      { factors: riskFactors.join('; ') },
      CODINGS_PSBI,
    );
  }

  private buildCard(
    rule: CdsRule,
    req: CdsHookRequest,
    indicator: CdsIndicator,
    defaultSummary: string,
    defaultDetail: string,
    vars: Record<string, string | number | boolean | null | undefined>,
    codings: CodedReference[],
  ): CdsCard {
    const ref = rule.references[0] ?? {
      label: 'WHO — Managing possible serious bacterial infection in young infants when referral is not feasible (2015)',
      url: 'https://www.who.int/publications/i/item/9789241509268',
    };
    const { summary, detail } = resolveCardCopy(
      rule,
      req,
      { summary: defaultSummary, detail: defaultDetail },
      vars,
    );
    return {
      summary,
      indicator,
      detail: detail.replace(/\s+/g, ' ').trim(),
      source: { label: ref.label, url: ref.url, strength: ref.strength },
      extension: {
        'http://vedamd.io/Card/recommendation': {
          ruleId: rule.id,
          ruleVersion: rule.ruleVersion,
          evidenceLevel: rule.evidenceLevel,
          generatedAt: new Date().toISOString(),
          codings,
        },
      },
    };
  }
}
