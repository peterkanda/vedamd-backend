import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Padua Prediction Score for VTE risk in hospitalised MEDICAL patients
 * (Barbar 2010; ASH 2018). Decides who needs pharmacological
 * thromboprophylaxis — VTE being a leading preventable cause of
 * inpatient death.
 *
 * Why deterministic: a weighted additive score whose threshold (≥4)
 * gates LMWH prophylaxis. Manual mis-scoring → missed prophylaxis
 * (preventable PE) or unnecessary anticoagulation (bleeding).
 *
 * Padua items (points):
 *   Active cancer 3 | Previous VTE 3 | Reduced mobility ≥3 days 3 |
 *   Known thrombophilia 3 | Recent (≤1 mo) trauma/surgery 2 |
 *   Age ≥70 1 | Cardiac/respiratory failure 1 | Acute MI/ischaemic
 *   stroke 1 | Acute infection/rheumatological disorder 1 | Obesity
 *   (BMI ≥30) 1 | Ongoing hormonal treatment 1.
 *   Score ≥4 → HIGH risk (offer pharmacological prophylaxis).
 *
 * Bleeding gate: if a high-bleeding-risk flag is present, recommend
 * MECHANICAL prophylaxis instead + reassess for pharmacological once
 * bleeding risk resolves.
 *
 * Anonymous-by-design. Reads only:
 *   context.medicalInpatient  boolean sentinel (fires only for admitted medical patients)
 *   context.activeCancer | context.previousVte | context.reducedMobility |
 *   context.thrombophilia | context.recentTraumaOrSurgery |
 *   context.cardiacOrRespFailure | context.acuteMiOrStroke |
 *   context.acuteInfectionOrRheum | context.ongoingHormonal  booleans
 *   context.ageYears  number (≥70 scores)
 *   context.bmi  number (≥30 scores)
 *   context.highBleedingRisk | context.activeBleeding  booleans (gate pharmacological prophylaxis)
 */

interface VteContext {
  medicalInpatient?: boolean;
  activeCancer?: boolean;
  previousVte?: boolean;
  reducedMobility?: boolean;
  thrombophilia?: boolean;
  recentTraumaOrSurgery?: boolean;
  acuteMiOrStroke?: boolean;
  cardiacOrRespFailure?: boolean;
  acuteInfectionOrRheum?: boolean;
  ongoingHormonal?: boolean;
  ageYears?: number;
  bmi?: number;
  highBleedingRisk?: boolean;
  activeBleeding?: boolean;
}

@Injectable()
export class VteProphylaxisStrategy implements CdsRuleStrategy {
  readonly type = 'vte-prophylaxis';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as VteContext;
    if (ctx.medicalInpatient !== true) return [];

    const parts: string[] = [];
    let score = 0;
    const add = (cond: boolean | undefined, pts: number, label: string) => {
      if (cond === true) { score += pts; parts.push(`${label} (+${pts})`); }
    };

    add(ctx.activeCancer, 3, 'active cancer');
    add(ctx.previousVte, 3, 'previous VTE');
    add(ctx.reducedMobility, 3, 'reduced mobility ≥3 days');
    add(ctx.thrombophilia, 3, 'thrombophilia');
    add(ctx.recentTraumaOrSurgery, 2, 'recent trauma/surgery');
    if (typeof ctx.ageYears === 'number' && ctx.ageYears >= 70) { score += 1; parts.push('age ≥70 (+1)'); }
    add(ctx.cardiacOrRespFailure, 1, 'cardiac/respiratory failure');
    add(ctx.acuteMiOrStroke, 1, 'acute MI/ischaemic stroke');
    add(ctx.acuteInfectionOrRheum, 1, 'acute infection/rheumatological');
    if (typeof ctx.bmi === 'number' && ctx.bmi >= 30) { score += 1; parts.push('obesity BMI ≥30 (+1)'); }
    add(ctx.ongoingHormonal, 1, 'ongoing hormonal treatment');

    const highRisk = score >= 4;
    const bleedingConcern = ctx.activeBleeding === true || ctx.highBleedingRisk === true;

    let indicator: CdsIndicator;
    let summary: string;
    let recommendation: string;

    if (highRisk && !bleedingConcern) {
      indicator = 'critical';
      summary = `VTE prophylaxis — Padua ${score} (high risk): offer pharmacological prophylaxis`;
      recommendation =
        'High VTE risk + no high bleeding risk → offer pharmacological thromboprophylaxis: enoxaparin 40 mg SC once daily ' +
        '(reduce to 20 mg if eGFR <30) OR fondaparinux 2.5 mg SC daily. Continue while at risk. Add mechanical prophylaxis ' +
        '(IPC/anti-embolic stockings) if extra measures warranted. Reassess daily.';
    } else if (highRisk && bleedingConcern) {
      indicator = 'warning';
      summary = `VTE prophylaxis — Padua ${score} (high risk) but bleeding risk: use mechanical prophylaxis`;
      recommendation =
        'High VTE risk BUT active/high bleeding risk → pharmacological prophylaxis is contraindicated for now. Use ' +
        'MECHANICAL prophylaxis (intermittent pneumatic compression). Reassess bleeding risk daily + switch to ' +
        'pharmacological prophylaxis once it resolves.';
    } else {
      indicator = 'info';
      summary = `VTE prophylaxis — Padua ${score} (low risk): pharmacological prophylaxis not routinely indicated`;
      recommendation =
        'Low VTE risk — routine pharmacological thromboprophylaxis not indicated. Encourage early mobilisation + adequate ' +
        'hydration. Reassess if clinical status changes.';
    }

    const ref = rule.references[0] ?? {
      label: 'ASH 2018 VTE Prophylaxis in Hospitalised Medical Patients',
      url: 'https://ashpublications.org/bloodadvances/article/2/22/3198/16107',
    };
    const detail = `Padua score ${score} (${parts.join(' | ') || 'no risk factors'}). ${recommendation}`;

    const { summary: outSummary, detail: outDetail } = resolveCardCopy(
      rule,
      req,
      { summary, detail },
      { score, components: parts.join(' | ') },
    );

    return [
      {
        summary: outSummary,
        indicator,
        detail: outDetail.replace(/\s+/g, ' ').trim(),
        source: { label: ref.label, url: ref.url, strength: ref.strength },
        extension: {
          'http://vedamd.io/Card/recommendation': {
            ruleId: rule.id,
            ruleVersion: rule.ruleVersion,
            evidenceLevel: rule.evidenceLevel,
            generatedAt: new Date().toISOString(),
          },
        },
      },
    ];
  }
}
