import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Postpartum care — WHO recommendations on maternal and newborn
 * care for a positive postnatal experience (2022) + Kenya MoH
 * Postnatal Care Guidelines.
 *
 * WHO requires at least four postnatal contacts: < 24 h, day 3
 * (48–72 h), day 7–14, and week 6. The integrator supplies how
 * long since delivery (postpartumHours / postpartumDays) and the
 * key clinical findings; the strategy returns:
 *
 *   1. CRITICAL — postpartum red flags any time in the first 6 weeks:
 *      heavy bleeding (soaking > 1 pad per hour, or any clot >
 *      golf-ball), fever ≥ 38 °C, foul-smelling lochia, SBP ≥ 160
 *      OR DBP ≥ 110 (postpartum pre-eclampsia / eclampsia), severe
 *      headache, visual disturbance, calf pain / swelling (DVT),
 *      shortness of breath, suicidal thoughts, breast abscess /
 *      mastitis with fever.
 *      → Refer / admit. Pathway depends on the trigger (see detail).
 *
 *   2. WARNING — first 24 h contact not done yet, or 24 h ≤ time
 *      < 48 h with no contact recorded:
 *      → Complete the first PNC checklist now (vital signs, lochia,
 *      uterine tone, perineum, breastfeeding latch, mother's mental
 *      state, newborn temperature / breathing / cord, vaccinations).
 *
 *   3. WARNING — day-3 / day-7 / week-6 contact overdue:
 *      → Bring forward.
 *
 *   4. WARNING — anaemia (Hb < 9) at 6 weeks → iron + folic acid 60 mg
 *      daily for at least 3 months and screen for cause.
 *
 *   5. WARNING — positive EPDS (≥ 13) or any item-10 self-harm: refer
 *      mental-health pathway.
 *
 *   6. INFO — routine 6-week visit reminders: contraception, infant
 *      growth, immunisations (BCG, polio-0 already at birth; OPV-1 /
 *      DTP-HepB-Hib-Hib / PCV-1 / rotavirus-1 / IPV at 6 weeks),
 *      cervical-cancer screening offer, infant feeding counselling.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.postpartumHours              number (optional)
 *   context.postpartumDays               number (optional)
 *   context.firstPncDone                 boolean
 *   context.day3PncDone                  boolean
 *   context.day7PncDone                  boolean
 *   context.week6PncDone                 boolean
 *   context.heavyBleeding                boolean
 *   context.feverC                       number (optional)
 *   context.foulLochia                   boolean
 *   context.bpSystolicMmHg               number (optional)
 *   context.bpDiastolicMmHg              number (optional)
 *   context.severeHeadache               boolean
 *   context.visualDisturbance            boolean
 *   context.calfPainOrSwelling           boolean
 *   context.dyspnoea                     boolean
 *   context.suicidalThoughts             boolean
 *   context.breastAbscess                boolean
 *   context.haemoglobinGdl               number (optional)
 *   context.epdsScore                    number (optional, 0..30)
 *   context.epdsItem10SelfHarm           boolean
 *   context.contraceptionPlanDocumented  boolean
 *   context.infantWeightLossPercent      number (optional, >10 = red flag)
 */

const POSTPARTUM_HYPERTENSION_SBP = 160;
const POSTPARTUM_HYPERTENSION_DBP = 110;
const POSTPARTUM_ANAEMIA_HB = 9;
const EPDS_CUTOFF = 13;

interface PostpartumContext {
  postpartumHours?: number;
  postpartumDays?: number;
  firstPncDone?: boolean;
  day3PncDone?: boolean;
  day7PncDone?: boolean;
  week6PncDone?: boolean;
  heavyBleeding?: boolean;
  feverC?: number;
  foulLochia?: boolean;
  bpSystolicMmHg?: number;
  bpDiastolicMmHg?: number;
  severeHeadache?: boolean;
  visualDisturbance?: boolean;
  calfPainOrSwelling?: boolean;
  dyspnoea?: boolean;
  suicidalThoughts?: boolean;
  breastAbscess?: boolean;
  haemoglobinGdl?: number;
  epdsScore?: number;
  epdsItem10SelfHarm?: boolean;
  contraceptionPlanDocumented?: boolean;
  infantWeightLossPercent?: number;
}

function postpartumDays(ctx: PostpartumContext): number | null {
  if (typeof ctx.postpartumDays === 'number') return ctx.postpartumDays;
  if (typeof ctx.postpartumHours === 'number') return ctx.postpartumHours / 24;
  return null;
}

@Injectable()
export class PostpartumCareStrategy implements CdsRuleStrategy {
  readonly type = 'postpartum-care';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as PostpartumContext;
    const days = postpartumDays(ctx);
    if (days == null || days < 0 || days > 42) return [];

    const cards: CdsCard[] = [];

    // 1. Critical red flags.
    const redFlags: string[] = [];
    if (ctx.heavyBleeding === true) redFlags.push('heavy bleeding (postpartum haemorrhage)');
    if (typeof ctx.feverC === 'number' && ctx.feverC >= 38) {
      redFlags.push(`fever ${ctx.feverC.toFixed(1)} °C (puerperal sepsis)`);
    }
    if (ctx.foulLochia === true) redFlags.push('foul-smelling lochia (endometritis)');
    if (
      typeof ctx.bpSystolicMmHg === 'number' &&
      ctx.bpSystolicMmHg >= POSTPARTUM_HYPERTENSION_SBP
    ) {
      redFlags.push(`SBP ${ctx.bpSystolicMmHg} mmHg (≥ ${POSTPARTUM_HYPERTENSION_SBP})`);
    }
    if (
      typeof ctx.bpDiastolicMmHg === 'number' &&
      ctx.bpDiastolicMmHg >= POSTPARTUM_HYPERTENSION_DBP
    ) {
      redFlags.push(`DBP ${ctx.bpDiastolicMmHg} mmHg (≥ ${POSTPARTUM_HYPERTENSION_DBP})`);
    }
    if (ctx.severeHeadache === true || ctx.visualDisturbance === true) {
      redFlags.push('severe headache or visual disturbance (postpartum pre-eclampsia)');
    }
    if (ctx.calfPainOrSwelling === true) redFlags.push('unilateral calf pain or swelling (DVT)');
    if (ctx.dyspnoea === true) redFlags.push('shortness of breath (PE / cardiac decompensation)');
    if (ctx.breastAbscess === true)
      redFlags.push('breast abscess or mastitis with systemic features');
    if (ctx.suicidalThoughts === true || ctx.epdsItem10SelfHarm === true) {
      redFlags.push('suicidal thoughts (perinatal mental-health emergency)');
    }

    if (redFlags.length > 0) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'critical',
          'Postpartum red flag — same-day referral / admission',
          'Red flag(s): {{flags}}. Resuscitate first: ABCs, IV access x 2 large-bore, oxygen, fluid resuscitation if bleeding. ' +
            'For PPH > 500 mL: uterine massage, IV oxytocin 10 IU bolus + 20 IU/L infusion, tranexamic acid 1 g IV within 3 h, ' +
            'inspect for retained products / lacerations / inverted uterus, balloon tamponade if atony persists. ' +
            'For postpartum pre-eclampsia (BP severe range): magnesium sulphate 4 g IV + 10 g IM loading + 5 g IM 4-hourly, ' +
            'antihypertensive (labetalol / hydralazine) target 140–150 / 90–100. For sepsis: blood cultures, broad-spectrum ' +
            'antibiotics within 1 hour (ampicillin + gentamicin + metronidazole). For DVT / PE: LMWH (enoxaparin 40 mg SC daily ' +
            'prophylaxis or 1 mg/kg twice daily treatment). For perinatal mental-health emergency: do not leave alone, mental-health ' +
            'crisis pathway, involve family / caregivers, screen for psychosis. Refer to CEmONC / appropriate facility.',
          { flags: redFlags.join('; ') },
        ),
      );
    }

    // 2. First-24 h PNC not done.
    if (days <= 1 && ctx.firstPncDone !== true) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'warning',
          'First postnatal contact within 24 h is mandatory — complete checklist now',
          'WHO 2022 + Kenya MoH require the first postnatal contact within the first 24 hours after delivery. Checklist: maternal ' +
            'vital signs, lochia colour and amount, uterine tone and position, perineum / wound, breasts and breastfeeding latch, ' +
            'pain control, urinary and bowel function, mental state and emotional support; newborn temperature, breathing, cord, ' +
            'colour, feeding, urine and meconium; vaccinations (BCG + oral polio at birth); document infant weight; counsel danger ' +
            'signs (mother and baby) and discharge with a planned day-3 contact.',
          {},
        ),
      );
    }

    // 3a. Day 3 contact overdue.
    if (days > 3 && days < 7 && ctx.day3PncDone !== true && ctx.firstPncDone === true) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'warning',
          'Day-3 postnatal contact overdue — bring forward',
          'Day-3 (48–72 h) contact is the second of four mandatory postnatal visits per WHO. Repeat the postpartum checklist; check ' +
            "baby weight (acceptable loss up to 7–10 % of birth weight), jaundice, feeding adequacy, mother's mental state and " +
            'lochia trend. Reinforce family-planning options and immunisation dates.',
          {},
        ),
      );
    }

    // 3b. Day 7 contact overdue.
    if (days >= 7 && days < 28 && ctx.day7PncDone !== true) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'warning',
          'Day-7 to day-14 postnatal contact overdue — complete now',
          'Third postnatal contact (day 7–14): check perineum / wound healing, lochia, uterine involution, breastfeeding, infant ' +
            'jaundice and weight (back to birth weight by day 14), screen mother for postnatal blues / depression, reinforce family ' +
            'planning, plan the week-6 contact.',
          {},
        ),
      );
    }

    // 3c. Week-6 contact overdue / due.
    if (days >= 28 && days <= 42 && ctx.week6PncDone !== true) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'info',
          'Week-6 postnatal contact — complete the standard package',
          'Final routine postnatal contact: maternal physical recovery review, contraception choice and initiation (any method ' +
            'except combined hormonal in early breastfeeding within 6 weeks), infant immunisations DTP-HepB-Hib-1 / PCV-1 / OPV-1 / ' +
            'rotavirus-1 / IPV-1 + EID-HIV PCR if HIV-exposed, cervical-cancer screen offer (HPV-DNA or VIA), perinatal-depression ' +
            'screen (EPDS or PHQ-9), counsel exclusive breastfeeding to 6 months.',
          {},
        ),
      );
    }

    // 4. Anaemia at any contact.
    if (typeof ctx.haemoglobinGdl === 'number' && ctx.haemoglobinGdl < POSTPARTUM_ANAEMIA_HB) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'warning',
          'Postpartum anaemia (Hb < {{thresh}} g/dL) — iron + folic acid + workup',
          'Haemoglobin {{hb}} g/dL is below the postpartum anaemia threshold ({{thresh}} g/dL). Start ferrous sulphate 200 mg three ' +
            'times daily plus folic acid 5 mg daily for at least 3 months. Investigate cause: malaria smear, stool examination for ' +
            'hookworm + giardia (deworm with albendazole 400 mg single dose if confirmed or empirically in endemic setting), HIV ' +
            'screen if unknown, peripheral film for haemolysis / haemoglobinopathy. Hb < 7 g/dL or symptomatic anaemia — refer for ' +
            'transfusion + parenteral iron. Recheck Hb at 6 weeks of therapy.',
          { hb: ctx.haemoglobinGdl.toFixed(1), thresh: POSTPARTUM_ANAEMIA_HB.toFixed(1) },
        ),
      );
    }

    // 5. EPDS positive.
    if (typeof ctx.epdsScore === 'number' && ctx.epdsScore >= EPDS_CUTOFF) {
      cards.push(
        this.buildCard(
          rule,
          req,
          'warning',
          'EPDS positive (≥ {{cut}}) — refer perinatal mental-health pathway',
          'EPDS score {{score}} suggests probable depression. Confirm with a structured clinical interview (PHQ-9 or DSM criteria). ' +
            'First-line: psychological therapy (CBT, interpersonal therapy, problem-solving therapy). Add SSRI (sertraline 50 mg ' +
            'daily, titrate to 100 mg; safe in breastfeeding) if moderate-severe or psychological therapy unavailable. Screen for ' +
            'partner / family violence, social adversity, infant interaction. Co-refer infant for stimulation / early development ' +
            'support. Re-screen every 2 weeks; escalate to specialist if no improvement at 4–6 weeks or any safety concerns.',
          { score: ctx.epdsScore, cut: EPDS_CUTOFF },
        ),
      );
    }

    return cards;
  }

  private buildCard(
    rule: CdsRule,
    req: CdsHookRequest,
    indicator: CdsIndicator,
    defaultSummary: string,
    defaultDetail: string,
    vars: Record<string, string | number | boolean | null | undefined>,
  ): CdsCard {
    const ref = rule.references[0] ?? {
      label:
        'WHO Recommendations on maternal and newborn care for a positive postnatal experience (2022)',
      url: 'https://www.who.int/publications/i/item/9789240045989',
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
        },
      },
    };
  }
}
