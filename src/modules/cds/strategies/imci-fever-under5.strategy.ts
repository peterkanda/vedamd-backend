import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import type { CdsRuleStrategy } from './types';

/**
 * IMCI fever assessment in children under five (WHO IMCI 2014).
 *
 * Emits a band of cards covering the full IMCI fever axis:
 *
 *   1. VERY SEVERE FEBRILE DISEASE
 *      - Any general danger sign OR stiff neck OR bulging fontanelle OR
 *        non-blanching purpura → critical
 *      - First dose IM/IV antibiotic + first dose antimalarial (if
 *        malaria risk) + glucose + urgent referral
 *
 *   2. Malaria classification (banded by local risk)
 *      - HIGH risk + fever → MALARIA (warning)
 *      - LOW risk + fever + no other cause → MALARIA (info)
 *      - NO risk + fever → FEVER (info; treat cause)
 *      - RDT-positive at any risk → confirmed malaria (warning)
 *
 *   3. Measles
 *      - Severe complicated measles: rash + general danger sign or
 *        cornea clouding or deep mouth ulcers → critical
 *      - Measles with eye / mouth complications → warning
 *      - Measles (rash + measles prodrome OR diagnosed in last 3 mo) →
 *        info
 *
 *   4. Dengue warning signs (in dengue-endemic / exposure context)
 *      - Bleeding / persistent vomiting / abdominal pain / mucosal
 *        bleeding / liver enlargement / lethargy → warning;
 *      - With any general danger sign → critical
 *
 *   5. Accompanying conditions surfaced separately when present:
 *      - Pneumonia (fast breathing per age band OR chest indrawing)
 *      - Severe dehydration (severe diarrhoea + dehydration)
 *      - Severe acute malnutrition (MUAC < 115, WHZ ≤ -3, bilateral
 *        pitting oedema, or severe wasting)
 *      - Severe anaemia (severe palmar pallor)
 *
 *   6. Prevention gaps (info) when fever workup completes:
 *      - Immunisations not up to date
 *      - Vitamin A overdue
 *
 * Anonymous-by-design: only non-identifying clinical signals are read.
 * Nothing is logged or persisted beyond the bounded, hashed audit trail.
 */

const FEVER_THRESHOLD_C = 37.5;
const UNDER_FIVE_MONTHS = 60;

interface ImciContext {
  ageMonths?: number;
  weightKg?: number;
  sex?: string;
  recentTemperaturesC?: number[];
  feverDurationDays?: number;
  dangerSigns?: string[];
  // Meningism / sepsis red flags
  stiffNeck?: boolean;
  bulgingFontanelle?: boolean;
  petechialRash?: boolean;
  mottledOrCyanotic?: boolean;
  prolongedCRT?: boolean;
  // Malaria
  malariaRiskArea?: 'high' | 'low' | 'none' | string;
  recentTravelToMalariaArea?: boolean;
  rdtResult?: 'positive' | 'negative' | 'not-done' | string;
  // Measles
  generalisedRash?: boolean;
  measlesProdrome?: boolean;
  recentMeasles?: boolean;
  corneaClouding?: boolean;
  deepMouthUlcers?: boolean;
  pusFromEye?: boolean;
  // Dengue
  dengueRiskArea?: boolean;
  bleedingSigns?: boolean;
  persistentAbdominalPain?: boolean;
  persistentVomiting?: boolean;
  mucosalBleeding?: boolean;
  lethargyRestlessness?: boolean;
  liverEnlarged?: boolean;
  // Accompanying
  cough?: boolean;
  respiratoryRate?: number;
  chestIndrawing?: boolean;
  stridor?: boolean;
  diarrhoea?: boolean;
  diarrhoeaDurationDays?: number;
  bloodInStool?: boolean;
  dehydration?: 'none' | 'some' | 'severe' | string;
  earPain?: boolean;
  earPainDurationDays?: number;
  // Nutrition
  palmarPallor?: 'none' | 'some' | 'severe' | string;
  severeWasting?: boolean;
  oedemaOfBothFeet?: boolean;
  muacMm?: number;
  whz?: number;
  // Immunisation
  immunisationsUpToDate?: boolean;
  vitaminAInLast6Months?: boolean;
  dewormingInLast6Months?: boolean;
  // HIV
  hivStatus?: string;
  cotrimoxazoleProphylaxis?: boolean;
  // Notes
  additionalSigns?: string;
}

const REF = {
  label: 'WHO IMCI Chartbook 2014',
  url: 'https://apps.who.int/iris/handle/10665/104772',
};

function makeCard(
  rule: CdsRule,
  summary: string,
  detail: string,
  indicator: CdsIndicator,
): CdsCard {
  return {
    summary,
    indicator,
    detail,
    source: { label: REF.label, url: REF.url },
    extension: {
      'http://vedamd.io/Card/recommendation': {
        ruleId: rule.id,
        ruleVersion: rule.ruleVersion,
        evidenceLevel: rule.evidenceLevel,
        generatedAt: new Date().toISOString(),
      },
    },
  };
}

function fastBreathingCutoff(ageMonths: number): number | null {
  if (ageMonths < 2) return 60;
  if (ageMonths < 12) return 50;
  if (ageMonths < 60) return 40;
  return null;
}

@Injectable()
export class ImciFeverUnder5Strategy implements CdsRuleStrategy {
  readonly type = 'imci-fever-under5';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as ImciContext;

    // Age gate.
    if (typeof ctx.ageMonths !== 'number' || ctx.ageMonths < 0) return [];
    if (ctx.ageMonths >= UNDER_FIVE_MONTHS) return [];

    // Fever gate — the strategy is only relevant if a fever was recorded
    // in the last 14 days (or temperature is currently elevated).
    const temps = Array.isArray(ctx.recentTemperaturesC)
      ? ctx.recentTemperaturesC.filter((t): t is number => typeof t === 'number' && isFinite(t))
      : [];
    if (temps.length === 0) return [];
    const maxTemp = Math.max(...temps);
    if (maxTemp < FEVER_THRESHOLD_C) return [];

    const cards: CdsCard[] = [];
    const ageMonths = ctx.ageMonths;

    // ── 1. VERY SEVERE FEBRILE DISEASE ───────────────────────────────
    const dangerSigns = Array.isArray(ctx.dangerSigns) ? ctx.dangerSigns : [];
    const hasGeneralDanger = dangerSigns.length > 0;
    const meningism = Boolean(ctx.stiffNeck || ctx.bulgingFontanelle || ctx.petechialRash);
    const sepsisRedFlag = Boolean(ctx.mottledOrCyanotic || ctx.prolongedCRT);
    const isVerySevere = hasGeneralDanger || meningism || sepsisRedFlag;

    if (isVerySevere) {
      const reasons: string[] = [];
      if (hasGeneralDanger)
        reasons.push(`IMCI danger sign(s): ${dangerSigns.join(', ')}`);
      if (ctx.stiffNeck) reasons.push('stiff neck');
      if (ctx.bulgingFontanelle) reasons.push('bulging fontanelle');
      if (ctx.petechialRash) reasons.push('non-blanching purpuric rash');
      if (ctx.mottledOrCyanotic) reasons.push('mottled / ashen skin');
      if (ctx.prolongedCRT) reasons.push('capillary refill > 3 s');
      cards.push(
        makeCard(
          rule,
          'VERY SEVERE FEBRILE DISEASE — give first dose + refer urgently',
          `Child ${ageMonths} mo, max temp ${maxTemp.toFixed(1)} °C. Trigger(s): ${reasons.join('; ')}. Give first-dose IM/IV antibiotic (ampicillin + gentamicin or ceftriaxone per local protocol). If malaria risk: first-dose artesunate IV/IM. Treat hypoglycaemia (give 5 mL/kg of 10% glucose IV). Treat / prevent shock with isotonic fluid bolus per IMCI. Refer URGENTLY to hospital with the mother and a referral note.`,
          'critical',
        ),
      );
    }

    // ── 2. Malaria classification ────────────────────────────────────
    const malariaRisk = (ctx.malariaRiskArea ?? '').toLowerCase();
    const malariaTravel = Boolean(ctx.recentTravelToMalariaArea);
    const rdt = (ctx.rdtResult ?? '').toLowerCase();
    if (rdt === 'positive') {
      cards.push(
        makeCard(
          rule,
          'CONFIRMED MALARIA (RDT positive) — first-line artemisinin combination therapy',
          `Confirmed P. falciparum (or P. vivax / P. knowlesi per local epidemiology) by RDT. Treat with the first-line ACT per local guideline (e.g. artemether-lumefantrine for ≥ 5 kg). Recheck in 48 h. Counsel on ITN use. Look for severe malaria features (anaemia, jaundice, dark urine, respiratory distress) — if any, treat as VERY SEVERE.`,
          'warning',
        ),
      );
    } else if (malariaRisk === 'high' || malariaTravel) {
      cards.push(
        makeCard(
          rule,
          'MALARIA — empirical first-line ACT (high malaria-risk area)',
          `High malaria risk area${malariaTravel ? ' (or recent travel to one)' : ''}. Per IMCI, fever in this setting is treated as malaria regardless of other features. Do an RDT if available; treat empirically if RDT not yet available and child is well. First-line: artemether-lumefantrine per body weight. Follow up at 48 h.`,
          'warning',
        ),
      );
    } else if (malariaRisk === 'low') {
      const hasOtherCause =
        ctx.cough || ctx.diarrhoea || ctx.earPain || ctx.generalisedRash || ctx.measlesProdrome;
      cards.push(
        makeCard(
          rule,
          hasOtherCause
            ? 'FEVER — non-malaria cause likely (low malaria-risk area)'
            : 'MALARIA possible — RDT recommended (low malaria-risk area)',
          hasOtherCause
            ? `Low malaria risk area with another likely focus (cough / diarrhoea / measles / ear). Treat the identified cause; reserve antimalarial for RDT-positive cases. Paracetamol 15 mg/kg/dose for fever ≥ 38.5 °C. Follow up if not improving in 48 h.`
            : `Low malaria risk area, no other obvious cause for fever. Do RDT; treat empirically only if positive. Paracetamol for symptomatic relief.`,
          hasOtherCause ? 'info' : 'warning',
        ),
      );
    } else if (malariaRisk === 'none') {
      cards.push(
        makeCard(
          rule,
          'FEVER (no malaria risk) — identify and treat the cause',
          `No malaria risk locally. Look for and treat the cause (URTI, otitis media, gastroenteritis, viral exanthem, UTI). Paracetamol 15 mg/kg/dose for fever ≥ 38.5 °C. Give safety-net advice and follow up in 48 h.`,
          'info',
        ),
      );
    }

    // ── 3. Measles ──────────────────────────────────────────────────
    const hasMeaslesNow = Boolean(ctx.generalisedRash && (ctx.measlesProdrome || ctx.cough));
    const hasRecentMeasles = Boolean(ctx.recentMeasles);
    if (hasMeaslesNow || hasRecentMeasles) {
      const severeComplicated =
        Boolean(ctx.corneaClouding || ctx.deepMouthUlcers) || hasGeneralDanger;
      const eyeMouth = Boolean(ctx.pusFromEye || ctx.deepMouthUlcers);
      if (severeComplicated) {
        cards.push(
          makeCard(
            rule,
            'SEVERE COMPLICATED MEASLES — refer urgently after first dose',
            `Measles (or measles in the last 3 months) with ${
              ctx.corneaClouding ? 'clouding of the cornea' : ctx.deepMouthUlcers ? 'deep mouth ulcers' : 'a general danger sign'
            }. Give vitamin A 200,000 IU PO (100,000 IU if 6-12 mo, 50,000 IU if < 6 mo). Apply tetracycline eye ointment if corneal involvement. First-dose IM/IV antibiotic. Refer URGENTLY.`,
            'critical',
          ),
        );
      } else if (eyeMouth) {
        cards.push(
          makeCard(
            rule,
            'MEASLES with eye / mouth complications',
            `${ctx.pusFromEye ? 'Pus from eye → ' : ''}${ctx.deepMouthUlcers ? 'Mouth ulcers → ' : ''}Give vitamin A 200,000 IU PO (age-banded as above). Tetracycline eye ointment 3×/day for pus from eye until clear; gentian violet for mouth ulcers. Review in 2 days.`,
            'warning',
          ),
        );
      } else {
        cards.push(
          makeCard(
            rule,
            hasRecentMeasles ? 'Recent measles (within 3 months) — heightened vigilance' : 'MEASLES',
            `Measles${hasRecentMeasles ? ' in the last 3 months' : ' currently'}. Give vitamin A 200,000 IU PO (age-banded). Counsel on rehydration + feeding. Watch for complications (pneumonia, diarrhoea, ear infection, blindness from vitamin A deficiency).`,
            'info',
          ),
        );
      }
    }

    // ── 4. Dengue warning signs ─────────────────────────────────────
    const dengueRisk = Boolean(ctx.dengueRiskArea);
    const dengueWarning =
      Boolean(
        ctx.bleedingSigns ||
          ctx.mucosalBleeding ||
          ctx.persistentVomiting ||
          ctx.persistentAbdominalPain ||
          ctx.liverEnlarged ||
          ctx.lethargyRestlessness,
      );
    if (dengueRisk && dengueWarning) {
      const reasons: string[] = [];
      if (ctx.bleedingSigns) reasons.push('bleeding');
      if (ctx.mucosalBleeding) reasons.push('mucosal bleeding');
      if (ctx.persistentVomiting) reasons.push('persistent vomiting');
      if (ctx.persistentAbdominalPain) reasons.push('abdominal pain');
      if (ctx.liverEnlarged) reasons.push('hepatomegaly');
      if (ctx.lethargyRestlessness) reasons.push('lethargy / restlessness');
      cards.push(
        makeCard(
          rule,
          'DENGUE WITH WARNING SIGNS — admit + close monitoring',
          `In dengue-endemic area with ${reasons.join(', ')}. Consider severe dengue (plasma leakage, shock, organ involvement). Check FBC (haemoconcentration + thrombocytopenia), Hct. Admit for monitoring; isotonic crystalloid per WHO dengue protocol; avoid NSAIDs.`,
          hasGeneralDanger ? 'critical' : 'warning',
        ),
      );
    }

    // ── 5. Accompanying — pneumonia ─────────────────────────────────
    const rrCutoff = fastBreathingCutoff(ageMonths);
    const fastBreathing =
      typeof ctx.respiratoryRate === 'number' && rrCutoff !== null && ctx.respiratoryRate >= rrCutoff;
    if (ctx.cough && (fastBreathing || ctx.chestIndrawing || ctx.stridor)) {
      if (ctx.chestIndrawing || ctx.stridor || hasGeneralDanger) {
        cards.push(
          makeCard(
            rule,
            'SEVERE PNEUMONIA / VERY SEVERE DISEASE — first dose + refer',
            `Cough + ${ctx.stridor ? 'stridor when calm' : ctx.chestIndrawing ? 'lower chest indrawing' : 'general danger sign'}. First-dose IM ampicillin + gentamicin (or ceftriaxone). O₂ if SpO₂ < 90% (high risk) or < 94% (sea level). Refer urgently.`,
            'critical',
          ),
        );
      } else {
        cards.push(
          makeCard(
            rule,
            'PNEUMONIA — oral amoxicillin',
            `Cough + fast breathing (RR ${ctx.respiratoryRate}/min, cut-off ≥ ${rrCutoff} for age). Oral amoxicillin DT 250 mg BD × 5 days (or 500 mg BD if ≥ 4 years). Reassess in 3 days; soothe throat + relieve cough with safe remedy.`,
            'warning',
          ),
        );
      }
    }

    // ── 6. Accompanying — diarrhoea / dehydration ────────────────────
    const dehyd = (ctx.dehydration ?? '').toLowerCase();
    if (ctx.diarrhoea || dehyd !== '') {
      if (dehyd === 'severe') {
        cards.push(
          makeCard(
            rule,
            'SEVERE DEHYDRATION — IV fluids urgently (Plan C)',
            `Start IV Ringer's lactate or NS: 30 mL/kg over 30 min (1 h if < 12 mo) then 70 mL/kg over 2½ h (5 h if < 12 mo). Reassess every 1-2 h. Refer urgently if not improving.`,
            'critical',
          ),
        );
      } else if (dehyd === 'some') {
        cards.push(
          makeCard(
            rule,
            'SOME DEHYDRATION — Plan B (ORS in clinic)',
            `Give ORS 75 mL/kg over 4 hours in the clinic. Reassess and re-classify hydration. Continue feeding; add zinc 20 mg/day × 14 days (10 mg/day if < 6 months).`,
            'warning',
          ),
        );
      } else if (ctx.diarrhoea) {
        cards.push(
          makeCard(
            rule,
            'DIARRHOEA without dehydration — Plan A + zinc',
            `Counsel mother on Plan A: extra fluid (ORS) after each loose stool, continue feeding, zinc 20 mg/day × 14 days (10 mg/day if < 6 months). Return immediately if fever / blood in stool / not eating / very thirsty / sicker.`,
            'info',
          ),
        );
      }
      if (ctx.bloodInStool) {
        cards.push(
          makeCard(
            rule,
            'DYSENTERY — empirical ciprofloxacin per local sensitivity',
            `Blood in stool. Treat for Shigella with ciprofloxacin (or local first-line per resistance pattern). Reassess in 3 days. Hospital referral if very young (< 6 mo) or any severity feature.`,
            'warning',
          ),
        );
      }
    }

    // ── 7. Accompanying — ear ───────────────────────────────────────
    if (ctx.earPain) {
      const chronic = (ctx.earPainDurationDays ?? 0) >= 14;
      cards.push(
        makeCard(
          rule,
          chronic ? 'CHRONIC EAR INFECTION — wicking + topical drops' : 'ACUTE EAR INFECTION — oral amoxicillin',
          chronic
            ? `Pus draining ≥ 14 days. Dry the ear by wicking; topical ciprofloxacin / quinolone drops × 2 weeks; review in 5 days. Refer if mastoid swelling.`
            : `Oral amoxicillin 25 mg/kg BD × 5 days for AOM. Paracetamol for pain. Review in 5 days.`,
          chronic ? 'warning' : 'info',
        ),
      );
    }

    // ── 8. Anaemia ──────────────────────────────────────────────────
    const pallor = (ctx.palmarPallor ?? '').toLowerCase();
    if (pallor === 'severe') {
      cards.push(
        makeCard(
          rule,
          'SEVERE ANAEMIA — refer urgently',
          `Severe palmar pallor. Hb likely < 6 g/dL. Refer to hospital for transfusion + workup (malaria, malnutrition, sickle cell, helminths).`,
          'critical',
        ),
      );
    } else if (pallor === 'some') {
      cards.push(
        makeCard(
          rule,
          'ANAEMIA — iron + deworming + investigate',
          `Some palmar pallor. Start iron 3 mg/kg/day × 14 days. Treat malaria if RDT positive. Mebendazole / albendazole single dose if ≥ 12 months and no deworming in last 6 months. Review in 14 days.`,
          'warning',
        ),
      );
    }

    // ── 9. Severe acute malnutrition ────────────────────────────────
    const sam =
      Boolean(ctx.oedemaOfBothFeet) ||
      Boolean(ctx.severeWasting) ||
      (typeof ctx.muacMm === 'number' && ctx.muacMm < 115) ||
      (typeof ctx.whz === 'number' && ctx.whz <= -3);
    const mam =
      !sam &&
      ((typeof ctx.muacMm === 'number' && ctx.muacMm >= 115 && ctx.muacMm < 125) ||
        (typeof ctx.whz === 'number' && ctx.whz > -3 && ctx.whz <= -2));
    if (sam) {
      cards.push(
        makeCard(
          rule,
          'SEVERE ACUTE MALNUTRITION — refer to inpatient or OTP',
          `MUAC < 115 mm / WHZ ≤ -3 / bilateral pitting oedema / visible severe wasting. Any SAM with complication (fever, hypothermia, hypoglycaemia, vomiting, severe pneumonia, dehydration) → inpatient stabilisation centre (F-75 milk, antibiotics, gradual refeeding per WHO 10-step protocol). Uncomplicated SAM with appetite → OTP / RUTF programme.`,
          'critical',
        ),
      );
    } else if (mam) {
      cards.push(
        makeCard(
          rule,
          'MODERATE ACUTE MALNUTRITION — supplementary feeding',
          `MUAC 115-124 mm / WHZ -3 to -2. Enrol in supplementary feeding programme. Counsel on feeding. Review in 2 weeks.`,
          'warning',
        ),
      );
    }

    // ── 10. Prevention gaps (info) ──────────────────────────────────
    const gaps: string[] = [];
    if (ctx.immunisationsUpToDate === false) gaps.push('immunisations not up to date');
    if (ctx.vitaminAInLast6Months === false && ageMonths >= 6) gaps.push('vitamin A overdue');
    if (
      ctx.dewormingInLast6Months === false &&
      ageMonths >= 12
    )
      gaps.push('deworming overdue (≥ 12 months)');
    if (gaps.length) {
      cards.push(
        makeCard(
          rule,
          'Prevention gaps — opportunistic catch-up at this visit',
          `Address before the child leaves the clinic: ${gaps.join('; ')}. Counsel parent on the missed item(s) and document the catch-up.`,
          'info',
        ),
      );
    }

    // ── 11. HIV exposure (where high prevalence) ────────────────────
    if (ctx.hivStatus === 'mother-positive' && !ctx.cotrimoxazoleProphylaxis) {
      cards.push(
        makeCard(
          rule,
          'HIV-exposed infant — start cotrimoxazole prophylaxis',
          `Mother HIV positive. Per WHO, all HIV-exposed infants should start cotrimoxazole prophylaxis from 4-6 weeks and continue until HIV infection definitively excluded. Refer to PMTCT for early infant diagnosis.`,
          'warning',
        ),
      );
    }

    // ── 12. Fallback — if nothing else fired, still flag the fever ──
    if (cards.length === 0) {
      cards.push(
        makeCard(
          rule,
          'Suspected febrile illness in a child under 5 — full IMCI fever assessment indicated',
          `Age ${ageMonths} months; max temp ${maxTemp.toFixed(1)} °C. No specific danger signs / malaria area / measles / dengue / accompanying conditions populated. Complete the IMCI fever assessment before any treatment — danger signs, neck stiffness, malaria risk + RDT, measles features, cough / diarrhoea / ear, palmar pallor + nutrition, immunisation status.`,
          'warning',
        ),
      );
    }

    return cards;
  }
}
