import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * CIWA-Ar (Clinical Institute Withdrawal Assessment for Alcohol, revised)
 * for alcohol withdrawal severity (Sullivan 1989; NICE CG100; ASAM 2020).
 * Drives symptom-triggered benzodiazepine dosing and flags delirium
 * tremens — withdrawal seizures and DTs being preventable causes of
 * inpatient death.
 *
 * Why deterministic: a 10-item additive scale (0–67) whose bands gate
 * benzodiazepine intensity. Manual mis-scoring → under-treatment
 * (seizures, DTs) or over-sedation (respiratory depression).
 *
 * CIWA-Ar items (each 0–7 unless noted):
 *   nausea/vomiting | tremor | paroxysmal sweats | anxiety | agitation |
 *   tactile disturbances | auditory disturbances | visual disturbances |
 *   headache/fullness in head | orientation & clouding of sensorium (0–4).
 *   <8 minimal | 8–15 moderate | >15 severe.
 *
 * Anonymous-by-design. Reads only:
 *   context.suspectedAlcoholWithdrawal  boolean sentinel
 *   context.ciwaScore  number (precomputed total; used as-is when present)
 *   context.nauseaVomiting | context.tremor | context.paroxysmalSweats |
 *   context.anxiety | context.agitation | context.tactileDisturbances |
 *   context.auditoryDisturbances | context.visualDisturbances |
 *   context.headache  numbers 0–7
 *   context.orientation  number 0–4
 *   context.seizureHistory | context.hallucinations  booleans (DT / seizure escalation)
 *   context.heartRate  number (autonomic instability ≥120 escalates)
 */

interface CiwaContext {
  suspectedAlcoholWithdrawal?: boolean;
  ciwaScore?: number;
  nauseaVomiting?: number;
  tremor?: number;
  paroxysmalSweats?: number;
  anxiety?: number;
  agitation?: number;
  tactileDisturbances?: number;
  auditoryDisturbances?: number;
  visualDisturbances?: number;
  headache?: number;
  orientation?: number;
  seizureHistory?: boolean;
  hallucinations?: boolean;
  heartRate?: number;
}

const ITEMS: { key: keyof CiwaContext; label: string; max: number }[] = [
  { key: 'nauseaVomiting', label: 'nausea/vomiting', max: 7 },
  { key: 'tremor', label: 'tremor', max: 7 },
  { key: 'paroxysmalSweats', label: 'paroxysmal sweats', max: 7 },
  { key: 'anxiety', label: 'anxiety', max: 7 },
  { key: 'agitation', label: 'agitation', max: 7 },
  { key: 'tactileDisturbances', label: 'tactile disturbances', max: 7 },
  { key: 'auditoryDisturbances', label: 'auditory disturbances', max: 7 },
  { key: 'visualDisturbances', label: 'visual disturbances', max: 7 },
  { key: 'headache', label: 'headache/fullness', max: 7 },
  { key: 'orientation', label: 'orientation/clouding', max: 4 },
];

@Injectable()
export class CiwaArStrategy implements CdsRuleStrategy {
  readonly type = 'alcohol-withdrawal-ciwa';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as CiwaContext;
    const hasPrecomputed = typeof ctx.ciwaScore === 'number';
    if (ctx.suspectedAlcoholWithdrawal !== true && !hasPrecomputed) return [];

    const parts: string[] = [];
    const missing: string[] = [];
    let computed = 0;
    for (const item of ITEMS) {
      const raw = ctx[item.key];
      if (typeof raw === 'number') {
        const v = Math.max(0, Math.min(item.max, raw));
        if (v > 0) parts.push(`${item.label} ${v}`);
        computed += v;
      } else {
        missing.push(item.label);
      }
    }

    const score = hasPrecomputed ? Math.max(0, Math.round(ctx.ciwaScore as number)) : computed;
    const incomplete = !hasPrecomputed && missing.length > 0;

    const redFlags: string[] = [];
    if (ctx.seizureHistory === true) redFlags.push('prior withdrawal seizures');
    if (ctx.hallucinations === true) redFlags.push('hallucinations');
    if (typeof ctx.heartRate === 'number' && ctx.heartRate >= 120)
      redFlags.push(`tachycardia ${ctx.heartRate}/min`);

    const severe = score > 15 || (score >= 8 && redFlags.length > 0);
    const moderate = !severe && score >= 8;

    let indicator: CdsIndicator;
    let summary: string;
    let recommendation: string;

    if (severe) {
      indicator = 'critical';
      summary = `Alcohol withdrawal — CIWA-Ar ${score} (severe): high benzodiazepine need, delirium-tremens risk`;
      recommendation =
        'Severe withdrawal / delirium-tremens risk → manage in a high-acuity / ICU setting with continuous monitoring. ' +
        'Symptom-triggered benzodiazepine front-loading: diazepam 10–20 mg PO/IV (or chlordiazepoxide 25–50 mg PO) ' +
        'every 1–2 h titrated to CIWA-Ar <8 and a calm, rousable patient; use lorazepam 2–4 mg IV if hepatic impairment. ' +
        'Give thiamine 200–500 mg IV BEFORE any glucose to prevent Wernicke; add folate and correct magnesium/potassium. ' +
        'For refractory agitation/DT consider phenobarbital or dexmedetomidine adjuncts. Treat/exclude seizures. Reassess CIWA-Ar hourly.';
    } else if (moderate) {
      indicator = 'warning';
      summary = `Alcohol withdrawal — CIWA-Ar ${score} (moderate): symptom-triggered benzodiazepine`;
      recommendation =
        'Moderate withdrawal → symptom-triggered benzodiazepine: diazepam 10 mg PO (or chlordiazepoxide 25 mg PO) and ' +
        'reassess CIWA-Ar every 1–2 h, repeating while the score stays ≥8. Give parenteral thiamine 200 mg IV/IM BEFORE ' +
        'any glucose, plus folate; correct magnesium. Monitor for escalation to seizures or delirium tremens.';
    } else {
      indicator = 'info';
      summary = `Alcohol withdrawal — CIWA-Ar ${score} (minimal): supportive care, monitor`;
      recommendation =
        'Minimal withdrawal — routine benzodiazepines not required. Provide supportive care, oral/IV thiamine ' +
        'prophylaxis and hydration, and reassess CIWA-Ar every 2–4 h; start symptom-triggered benzodiazepine if the ' +
        'score rises to ≥8 or seizures/hallucinations appear.';
    }

    const ref = rule.references[0] ?? {
      label: 'NICE CG100 Alcohol-use disorders: diagnosis and management',
      url: 'https://www.nice.org.uk/guidance/cg100',
    };

    const componentText = hasPrecomputed
      ? 'score supplied directly'
      : parts.join(' | ') || 'no symptoms scored';
    const flagText = redFlags.length > 0 ? ` Red flags: ${redFlags.join(', ')}.` : '';
    const incompleteText = incomplete
      ? ` ${missing.length} item(s) not supplied (${missing.join(', ')}) — score is a minimum until the full CIWA-Ar is completed.`
      : '';
    const detail = `CIWA-Ar ${score} (${componentText}).${flagText}${incompleteText} ${recommendation}`;

    const { summary: outSummary, detail: outDetail } = resolveCardCopy(
      rule,
      req,
      { summary, detail },
      { score, components: componentText },
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
