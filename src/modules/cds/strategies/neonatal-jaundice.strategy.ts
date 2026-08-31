import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator, CodedReference } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Neonatal jaundice — AAP Clinical Practice Guideline Revision 2022
 * (management of hyperbilirubinaemia in the newborn ≥ 35 weeks
 * gestation) + WHO Pocket Book of Hospital Care for Children
 * (2nd edn) + Kenya MoH National Newborn Care Guidelines.
 *
 *   1. CRITICAL — bilirubin at or above the AAP exchange-transfusion
 *      threshold, OR features of acute bilirubin encephalopathy
 *      (lethargy, hypotonia → hypertonia, retrocollis / opisthotonus,
 *      shrill cry, fever, seizures): admit + urgent intensive
 *      phototherapy + prepare for exchange transfusion + escalate to
 *      neonatology.
 *
 *   2. CRITICAL — jaundice in the first 24 h of life: ALWAYS
 *      pathological (haemolysis, sepsis, congenital infection,
 *      G6PD deficiency, severe ABO / Rh disease). Admit, check TSB,
 *      DAT, blood group, G6PD, sepsis screen, and start
 *      phototherapy.
 *
 *   3. CRITICAL — bilirubin at or above the AAP phototherapy
 *      threshold for the postnatal age + risk profile: start
 *      intensive phototherapy now.
 *
 *   4. WARNING — bilirubin in the "watch" zone (within 2 mg/dL of
 *      phototherapy threshold, OR rate of rise > 0.2 mg/dL/h), or
 *      visible jaundice extending below the umbilicus in a term
 *      infant: repeat TSB in 6–12 h, optimise feeding, screen for
 *      cause.
 *
 *   5. WARNING — prolonged jaundice (> 14 days at term, > 21 days
 *      preterm): investigate for biliary atresia, hypothyroidism,
 *      UTI, breastmilk jaundice; check conjugated bilirubin
 *      (must be < 1 mg/dL or < 20 % of total).
 *
 *   6. INFO — clinical jaundice within physiological range, infant
 *      well, feeding well: reassure, counsel feeding, follow up.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageHours                    number (postnatal age in hours)
 *   context.gestationalAgeWeeks         number
 *   context.weightKg                    number (informational)
 *   context.totalBilirubinMgDl          number (or convert from µmol/L)
 *   context.totalBilirubinUmolL         number (alternative input)
 *   context.directBilirubinMgDl         number (optional, for prolonged)
 *   context.acuteBilirubinEncephalopathy boolean
 *   context.jaundiceFirst24h            boolean
 *   context.jaundiceExtendsBelowUmbilicus boolean
 *   context.riseRateMgDlPerHour         number (optional, > 0.2 = rapid)
 *   context.directAntiglobulinPositive  boolean
 *   context.knownG6pdDeficiency         boolean
 *   context.aboOrRhIncompatibility      boolean
 *   context.sepsisSuspected             boolean
 *   context.feedingPoorly               boolean
 *   context.duskySkinPallor             boolean (haemolysis screen)
 *   context.ageDays                     number (for prolonged threshold)
 */

interface NeonatalContext {
  ageHours?: number;
  ageDays?: number;
  gestationalAgeWeeks?: number;
  weightKg?: number;
  totalBilirubinMgDl?: number;
  totalBilirubinUmolL?: number;
  directBilirubinMgDl?: number;
  acuteBilirubinEncephalopathy?: boolean;
  jaundiceFirst24h?: boolean;
  jaundiceExtendsBelowUmbilicus?: boolean;
  riseRateMgDlPerHour?: number;
  directAntiglobulinPositive?: boolean;
  knownG6pdDeficiency?: boolean;
  aboOrRhIncompatibility?: boolean;
  sepsisSuspected?: boolean;
  feedingPoorly?: boolean;
  duskySkinPallor?: boolean;
}

const CODINGS_JAUNDICE: CodedReference[] = [
  {
    system: 'http://hl7.org/fhir/sid/icd-10',
    code: 'P59',
    display: 'Neonatal jaundice from other and unspecified causes',
    kind: 'diagnosis',
  },
  {
    system: 'http://hl7.org/fhir/sid/icd-10',
    code: 'P57',
    display: 'Kernicterus',
    kind: 'diagnosis',
  },
  {
    system: 'http://hl7.org/fhir/sid/icd-10',
    code: 'P55',
    display: 'Haemolytic disease of newborn',
    kind: 'diagnosis',
  },
  {
    system: 'http://id.who.int/icd/release/11/mms',
    code: 'KA86',
    display: 'Neonatal jaundice',
    kind: 'diagnosis',
  },
  {
    system: 'http://id.who.int/icd/release/11/mms',
    code: 'KA64',
    display: 'Kernicterus',
    kind: 'diagnosis',
  },
  {
    system: 'http://snomed.info/sct',
    code: '387731001',
    display: 'Neonatal jaundice (disorder)',
    kind: 'diagnosis',
  },
  {
    system: 'http://snomed.info/sct',
    code: '234468005',
    display: 'Severe hyperbilirubinaemia of newborn (disorder)',
    kind: 'diagnosis',
  },
  {
    system: 'http://loinc.org',
    code: '1975-2',
    display: 'Bilirubin.total [Mass/volume] in Serum (neonatal)',
    kind: 'lab',
  },
  {
    system: 'http://loinc.org',
    code: '6082-2',
    display: 'Direct (conjugated) bilirubin [Mass/volume] in Serum',
    kind: 'lab',
  },
];

function tsbMgDl(ctx: NeonatalContext): number | undefined {
  if (typeof ctx.totalBilirubinMgDl === 'number') return ctx.totalBilirubinMgDl;
  if (typeof ctx.totalBilirubinUmolL === 'number') return ctx.totalBilirubinUmolL / 17.1;
  return undefined;
}

/**
 * AAP 2022 phototherapy and exchange-transfusion thresholds.
 * Simplified two-curve model:
 *   - "high risk" applies if gestational age < 38 weeks OR any of
 *     DAT-positive, known G6PD, ABO/Rh, sepsis, dusky pallor,
 *     poor feeding (the AAP "neurotoxicity risk factors").
 *   - returns thresholds for the postnatal age (in hours, clipped
 *     to 12..168 h).
 *
 * NOTE: These curves are linearised approximations of the AAP 2022
 * nomogram. Clinicians should still consult the full nomograms; this
 * rule is a decision-support trigger, not a calibration source.
 */
function aapPhototherapyThresholdMgDl(ageHours: number, highRisk: boolean): number {
  const h = Math.max(12, Math.min(168, ageHours));
  if (highRisk) {
    if (h <= 24) return 7 + (8 - 7) * ((h - 12) / 12); // 7 → 8
    if (h <= 48) return 8 + (10 - 8) * ((h - 24) / 24); // 8 → 10
    if (h <= 72) return 10 + (12 - 10) * ((h - 48) / 24); // 10 → 12
    if (h <= 96) return 12 + (13 - 12) * ((h - 72) / 24);
    return 14;
  }
  if (h <= 24) return 9 + (11 - 9) * ((h - 12) / 12);
  if (h <= 48) return 11 + (13 - 11) * ((h - 24) / 24);
  if (h <= 72) return 13 + (15 - 13) * ((h - 48) / 24);
  if (h <= 96) return 15 + (17 - 15) * ((h - 72) / 24);
  return 18;
}

function aapExchangeThresholdMgDl(ageHours: number, highRisk: boolean): number {
  return aapPhototherapyThresholdMgDl(ageHours, highRisk) + 5;
}

@Injectable()
export class NeonatalJaundiceStrategy implements CdsRuleStrategy {
  readonly type = 'neonatal-jaundice';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as NeonatalContext;
    if (typeof ctx.ageHours !== 'number' && typeof ctx.ageDays !== 'number') return [];
    const ageHours = typeof ctx.ageHours === 'number' ? ctx.ageHours : (ctx.ageDays ?? 0) * 24;
    if (ageHours < 0 || ageHours > 28 * 24) return [];

    const tsb = tsbMgDl(ctx);
    const highRisk =
      (typeof ctx.gestationalAgeWeeks === 'number' && ctx.gestationalAgeWeeks < 38) ||
      ctx.directAntiglobulinPositive === true ||
      ctx.knownG6pdDeficiency === true ||
      ctx.aboOrRhIncompatibility === true ||
      ctx.sepsisSuspected === true ||
      ctx.feedingPoorly === true ||
      ctx.duskySkinPallor === true;

    // 1. Acute bilirubin encephalopathy — always critical.
    if (ctx.acuteBilirubinEncephalopathy === true) {
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Acute bilirubin encephalopathy — exchange transfusion preparation now',
          'Features of acute bilirubin encephalopathy (lethargy progressing to hypertonia, retrocollis / opisthotonus, shrill cry, ' +
            'fever, seizures) are a medical emergency. Start INTENSIVE phototherapy IMMEDIATELY (continuous, multiple LED panels, ' +
            'irradiance ≥ 30 µW/cm²/nm across the largest possible body surface area; eye and gonad protection only). Prepare for ' +
            'exchange transfusion: cross-match 2 units, IV access x 2, NPO, monitor temperature / glucose / electrolytes / calcium. ' +
            'Investigate cause: TSB + direct bilirubin, blood group + DAT, full blood count + reticulocytes + peripheral film, G6PD ' +
            'assay (after exchange to avoid spuriously normal result from haemolysed cells), TORCH screen, sepsis work-up. Notify ' +
            'neonatology / paediatrics urgently. Counsel family about kernicterus and long-term neurodevelopmental follow-up.',
          {},
          CODINGS_JAUNDICE,
        ),
      ];
    }

    // 2. Jaundice in the first 24 h.
    if (ctx.jaundiceFirst24h === true || ageHours < 24) {
      const visibleJaundice =
        ctx.jaundiceFirst24h === true ||
        ctx.jaundiceExtendsBelowUmbilicus === true ||
        (typeof tsb === 'number' && tsb > 0);
      if (visibleJaundice) {
        return [
          this.buildCard(
            rule,
            req,
            'critical',
            'Jaundice in the first 24 h of life — pathological until proven otherwise',
            'Jaundice within the first 24 hours of life is NEVER physiological. Admit the infant. Measure total serum bilirubin and ' +
              "direct bilirubin immediately. Obtain blood group and direct antiglobulin test (DAT) for the infant and the mother's " +
              'group / antibody screen. Full blood count, reticulocytes, peripheral film for spherocytes / fragments, G6PD screen ' +
              '(common cause in sub-Saharan Africa boys), sepsis screen, urine and blood culture. Start phototherapy immediately ' +
              'while investigations are pending — do not wait. Counsel the family on possible kernicterus and follow-up; arrange ' +
              'paediatric / neonatology review within hours.',
            {},
            CODINGS_JAUNDICE,
          ),
        ];
      }
    }

    // 3 + 4. Threshold-based decisions.
    if (typeof tsb === 'number') {
      const photo = aapPhototherapyThresholdMgDl(ageHours, highRisk);
      const exch = aapExchangeThresholdMgDl(ageHours, highRisk);
      if (tsb >= exch) {
        return [
          this.buildCard(
            rule,
            req,
            'critical',
            'TSB ≥ AAP exchange-transfusion threshold — exchange transfusion + intensive phototherapy now',
            'TSB {{tsb}} mg/dL meets the AAP 2022 exchange-transfusion threshold ({{thresh}} mg/dL at {{age}} h postnatal age, ' +
              '{{risk}} risk profile). Start INTENSIVE phototherapy immediately and prepare for double-volume exchange transfusion ' +
              '(160 mL/kg, fresh whole blood reconstituted to a haematocrit ~50 %). Cross-match. NPO. IV access x 2 (umbilical ' +
              'venous catheter is ideal). Monitor temperature, glucose, electrolytes, calcium and pH during exchange. Investigate ' +
              'cause concurrently: DAT, blood group, FBC + reticulocytes + film, G6PD, sepsis screen, TORCH. After exchange, ' +
              'continue intensive phototherapy and recheck TSB at 2, 4 and 6 hours.',
            {
              tsb: tsb.toFixed(1),
              thresh: exch.toFixed(1),
              age: ageHours.toFixed(0),
              risk: highRisk ? 'high' : 'standard',
            },
            CODINGS_JAUNDICE,
          ),
        ];
      }
      if (tsb >= photo) {
        return [
          this.buildCard(
            rule,
            req,
            'critical',
            'TSB ≥ AAP phototherapy threshold — start intensive phototherapy',
            'TSB {{tsb}} mg/dL meets the AAP 2022 phototherapy threshold ({{thresh}} mg/dL at {{age}} h postnatal age, {{risk}} ' +
              'risk profile). Start INTENSIVE phototherapy (continuous, multiple LED panels, irradiance ≥ 30 µW/cm²/nm across the ' +
              'largest body surface; eye + gonad shields). Continue feeding (breastfeed every 2–3 h or formula by demand) — adequate ' +
              'fluid intake speeds clearance. Recheck TSB at 4–6 h. Investigate cause if rapid rise OR risk factors: DAT, blood ' +
              'group, FBC + reticulocytes + film, G6PD, sepsis screen. Reassess phototherapy threshold daily; stop when TSB is ' +
              '≥ 2 mg/dL below the current threshold for 12 h, but rebound check 12–24 h after stopping.',
            {
              tsb: tsb.toFixed(1),
              thresh: photo.toFixed(1),
              age: ageHours.toFixed(0),
              risk: highRisk ? 'high' : 'standard',
            },
            CODINGS_JAUNDICE,
          ),
        ];
      }
      if (
        tsb >= photo - 2 ||
        (typeof ctx.riseRateMgDlPerHour === 'number' && ctx.riseRateMgDlPerHour > 0.2)
      ) {
        return [
          this.buildCard(
            rule,
            req,
            'warning',
            '"Watch zone" — repeat TSB in 6–12 h, optimise feeding',
            'TSB {{tsb}} mg/dL is within 2 mg/dL of the AAP phototherapy threshold ({{thresh}} mg/dL) OR rising at > 0.2 mg/dL/h. ' +
              'Repeat TSB in 6–12 hours. Optimise feeding (≥ 8 breastfeeds in 24 h; supplement with expressed milk or formula only if ' +
              'weight loss > 10 % of birth weight, dehydration or hypernatraemia). Identify and document risk factors (DAT, G6PD ' +
              'screen, sepsis review). Discharge from hospital only when a TSB safely below the threshold AND a feeding plan AND a ' +
              'follow-up TSB within 24–48 h are in place.',
            { tsb: tsb.toFixed(1), thresh: photo.toFixed(1) },
            CODINGS_JAUNDICE,
          ),
        ];
      }
    }

    // 5. Prolonged jaundice.
    if (
      (typeof ctx.ageDays === 'number' &&
        (typeof ctx.gestationalAgeWeeks !== 'number' || ctx.gestationalAgeWeeks >= 37) &&
        ctx.ageDays > 14) ||
      (typeof ctx.ageDays === 'number' && ctx.ageDays > 21)
    ) {
      const directLine =
        typeof ctx.directBilirubinMgDl === 'number'
          ? `Direct bilirubin ${ctx.directBilirubinMgDl.toFixed(1)} mg/dL.`
          : 'Direct bilirubin not yet measured.';
      const cholestasisLine =
        typeof ctx.directBilirubinMgDl === 'number' && ctx.directBilirubinMgDl > 1
          ? ' Conjugated hyperbilirubinaemia — refer URGENTLY for biliary atresia work-up (abdominal ultrasound, HIDA scan if available, liver biopsy). The Kasai portoenterostomy window closes by 60 days of life.'
          : '';
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Prolonged neonatal jaundice — measure conjugated bilirubin + screen for cause',
          'Jaundice persisting beyond 14 days (term) or 21 days (preterm). {{direct}} Investigate: total + direct bilirubin (MUST be ' +
            'split), thyroid-stimulating hormone (congenital hypothyroidism), urine culture (UTI is an under-recognised cause), liver ' +
            'function tests, G6PD screen, breastmilk-jaundice history. Conjugated bilirubin > 1 mg/dL OR > 20 % of total is ' +
            'cholestasis — pale stools and dark urine suggest biliary atresia.{{cholestasis}}',
          { direct: directLine, cholestasis: cholestasisLine },
          CODINGS_JAUNDICE,
        ),
      ];
    }

    // 6. Visible jaundice without TSB.
    if (ctx.jaundiceExtendsBelowUmbilicus === true) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Visible jaundice extending below the umbilicus — measure TSB urgently',
          'Visual estimation is unreliable, but jaundice extending below the umbilicus suggests TSB ≥ 12 mg/dL and warrants ' +
            'measurement. Obtain total + direct bilirubin (transcutaneous bilirubinometer is acceptable for screening but use ' +
            "serum total bilirubin for any decision near the threshold). Reassess against the AAP nomogram at the infant's " +
            'postnatal age + risk profile.',
          {},
          CODINGS_JAUNDICE,
        ),
      ];
    }

    return [
      this.buildCard(
        rule,
        req,
        'info',
        'Within physiological range — reinforce feeding and follow-up',
        'No threshold features. Counsel the family: feed at least 8 times in 24 hours, expose to indirect daylight (not direct ' +
          'sun), watch for jaundice extending below the umbilicus, lethargy, poor feeding, fever or seizures — return immediately ' +
          'if any of these occur. Routine follow-up at day 3, day 7 and week 6 per WHO PNC schedule.',
        {},
        CODINGS_JAUNDICE,
      ),
    ];
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
      label:
        'AAP — Clinical Practice Guideline Revision: Management of Hyperbilirubinaemia in the Newborn ≥ 35 weeks (2022)',
      url: 'https://publications.aap.org/pediatrics/article/150/3/e2022058859/188726',
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
