import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Snake-bite triage — WHO Guidelines for the Management of Snakebites
 * (2nd edition, 2016) + Kenya MoH snake-bite protocols.
 *
 * Tiers:
 *
 *   1. CRITICAL — Envenomation features (any of):
 *      • Local: extensive limb swelling crossing two joints, blistering,
 *        necrosis, severe pain disproportionate to wound, ascending
 *        oedema
 *      • Haematotoxic: gum bleeding, ecchymosis, haematuria, melaena,
 *        haemoptysis, prolonged 20-minute whole-blood clotting test
 *      • Neurotoxic: ptosis, ophthalmoplegia, bulbar palsy, generalised
 *        weakness, respiratory muscle paralysis
 *      • Cardiotoxic / systemic: shock, arrhythmia, AKI
 *      → Give polyvalent antivenom per local protocol (most SSA: SAIMR
 *        / VINS polyvalent 10 vials IV over 30–60 min; halve dose for
 *        children if specified by manufacturer), monitor for reaction;
 *        manage neurotoxic envenomation with atropine 0.6 mg + neostig-
 *        mine 0.5 mg IV trial; treat coagulopathy after antivenom only
 *        (whole-blood transfusion last resort); analgesia (paracetamol/
 *        opioid — NOT NSAIDs).
 *
 *   2. WARNING — Definite bite without envenomation features:
 *      observe for ≥ 24 h (cobra / mamba can present late), repeat the
 *      20-minute whole-blood clotting test every 6 h, mark the edge of
 *      swelling, splint and elevate the limb, tetanus prophylaxis if
 *      not up to date, do NOT incise / suck / apply tourniquet / cold
 *      compresses, identify snake from photos if possible.
 *
 *   3. INFO — Suspected non-venomous or dry bite with no progression
 *      after 4 h of observation:
 *      counsel return-immediately signs; tetanus and wound care;
 *      community education.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                 number ≥ 0
 *   context.weightKg                 number (optional — paediatric notes)
 *   context.confirmedBite            boolean (sentinel)
 *   context.timeSinceBiteMin         number (optional)
 *   context.dryBiteSuspected         boolean
 *   context.localSwellingCrossesJoint boolean
 *   context.blisteringOrNecrosis     boolean
 *   context.systemicBleeding         boolean
 *   context.whole20MinClottingFailed boolean
 *   context.ptosisOrBulbarPalsy      boolean
 *   context.generalisedWeakness      boolean
 *   context.shockOrArrhythmia        boolean
 *   context.akiSuspected             boolean
 */

interface SnakeContext {
  ageYears?: number;
  weightKg?: number;
  confirmedBite?: boolean;
  timeSinceBiteMin?: number;
  dryBiteSuspected?: boolean;
  localSwellingCrossesJoint?: boolean;
  blisteringOrNecrosis?: boolean;
  systemicBleeding?: boolean;
  whole20MinClottingFailed?: boolean;
  ptosisOrBulbarPalsy?: boolean;
  generalisedWeakness?: boolean;
  shockOrArrhythmia?: boolean;
  akiSuspected?: boolean;
}

@Injectable()
export class SnakeBiteTriageStrategy implements CdsRuleStrategy {
  readonly type = 'snake-bite-triage';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as SnakeContext;
    if (ctx.confirmedBite !== true) return [];

    const local: string[] = [];
    if (ctx.localSwellingCrossesJoint === true) local.push('swelling crossing two joints');
    if (ctx.blisteringOrNecrosis === true) local.push('blistering / necrosis');

    const haem: string[] = [];
    if (ctx.systemicBleeding === true) haem.push('systemic bleeding (gums / urine / GI / lung)');
    if (ctx.whole20MinClottingFailed === true) {
      haem.push('failed 20-minute whole-blood clotting test');
    }

    const neuro: string[] = [];
    if (ctx.ptosisOrBulbarPalsy === true) neuro.push('ptosis / bulbar palsy');
    if (ctx.generalisedWeakness === true) neuro.push('generalised weakness / respiratory muscle paralysis');

    const systemic: string[] = [];
    if (ctx.shockOrArrhythmia === true) systemic.push('shock / arrhythmia');
    if (ctx.akiSuspected === true) systemic.push('acute kidney injury suspected');

    const envenomationFeatures = [...local, ...haem, ...neuro, ...systemic];

    if (envenomationFeatures.length > 0) {
      const neurotoxic = neuro.length > 0;
      const childNote =
        typeof ctx.weightKg === 'number' && ctx.weightKg > 0 && ctx.weightKg < 30
          ? ` Paediatric patient (~${ctx.weightKg.toFixed(0)} kg) — DO NOT reduce antivenom by weight; the venom load is the same regardless of body size. Use the same number of vials and pre-medicate cautiously.`
          : '';
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Envenomation features — give antivenom and start the snake-bite bundle',
          'Envenomation feature(s): {{features}}. Per the WHO 2016 snake-bite guidelines and Kenya MoH protocol: secure IV ' +
            'access, take pre-treatment bloods (haemoglobin, platelets, INR, U&E, creatinine, urinalysis). Give polyvalent ' +
            'antivenom — typical SSA dose 10 vials IV over 30–60 minutes diluted in normal saline; have adrenaline, antihistamine ' +
            'and hydrocortisone immediately available for early antivenom reactions. Repeat the 20-minute whole-blood clotting ' +
            'test at 6 h; if still abnormal, give a second dose of antivenom. For neurotoxic envenomation give a trial of ' +
            'atropine 0.6 mg + neostigmine 0.5 mg IV — improvement confirms post-synaptic toxin and the trial is repeated 4-hourly. ' +
            'Manage pain with paracetamol or opioid; AVOID NSAIDs. Update tetanus.{{childNote}} Refer to surgical care for ' +
            'debridement or fasciotomy only after coagulopathy is corrected.{{neuro}}',
          {
            features: envenomationFeatures.join('; '),
            childNote,
            neuro: neurotoxic
              ? ' Manage airway proactively: respiratory paralysis can be sudden and complete — prepare for bag-valve-mask ventilation and elective intubation if bulbar palsy progresses.'
              : '',
          },
        ),
      ];
    }

    if (ctx.dryBiteSuspected === true) {
      return [
        this.buildCard(
          rule,
          req,
          'info',
          'Dry-bite pattern — observe 4 hours then re-assess',
          'Some venomous-snake bites do not deliver venom ("dry bites"). Observe for at least 4 hours, repeat clinical exam ' +
            'and whole-blood clotting test before discharge. Update tetanus prophylaxis. Counsel return-immediately signs: ' +
            'new swelling, bleeding, drooping eyelids, weakness, blood in urine or stool, breathlessness.',
          {},
        ),
      ];
    }

    return [
      this.buildCard(
        rule,
        req,
        'warning',
        'Definite bite without envenomation features — admit for 24-hour observation',
        'No envenomation features yet identified. Admit for at least 24 hours of observation (cobra and mamba can present ' +
          'late). Repeat 20-minute whole-blood clotting test every 6 hours, mark the edge of any local swelling with a pen ' +
          'and re-check hourly, splint and elevate the limb. AVOID incision, suction, tourniquet, cold compresses or ' +
          'tight bandaging — these worsen necrosis. Update tetanus prophylaxis; ID the snake from photos / family description ' +
          'where possible.',
        {},
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
  ): CdsCard {
    const ref = rule.references[0] ?? {
      label: 'WHO — Guidelines for the management of snakebites (2nd edition, 2016)',
      url: 'https://www.who.int/publications/i/item/9789290225300',
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
      source: { label: ref.label, url: ref.url },
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
