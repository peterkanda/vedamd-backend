import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * STEMI reperfusion pathway — primary PCI vs fibrinolysis (ESC STEMI
 * 2023; AHA 2022). On an ECG-confirmed STEMI, time-to-reperfusion is
 * the dominant determinant of mortality; the deterministic decision is
 * "can the patient reach PCI within 120 min — if not, lyse now".
 *
 * Why deterministic: a strict time-and-contraindication algorithm.
 * Hesitation or mis-judging the 120-minute window costs myocardium.
 *
 * Decision:
 *   PCI-capable transfer ≤ 120 min → primary PCI.
 *   Otherwise + onset ≤ 12 h → fibrinolysis NOW (door-to-needle ≤ 10 min)
 *     then transfer for PCI within 2–24 h (pharmaco-invasive), UNLESS a
 *     fibrinolysis contraindication is present → emergency PCI transfer.
 *   Onset > 12 h → fibrinolysis not routinely beneficial; PCI if ongoing
 *     ischaemia / instability.
 *
 * Anonymous-by-design. Reads only:
 *   context.stEcgFinding 'stemi' | context.suspectedStemi boolean (sentinel)
 *   context.symptomOnsetMin   number (minutes since symptom onset)
 *   context.transferToPciMin  number (minutes to a PCI-capable centre)
 *   context.bleedingRisk | context.recentStroke | context.recentSurgeryOrTrauma |
 *   context.activeBleeding  booleans (fibrinolysis contraindications)
 *   context.systolicMmHg | context.diastolicMmHg  number (>180/110 relative CI)
 */

const PCI_WINDOW_MIN = 120;
const LYSIS_WINDOW_MIN = 12 * 60;

interface StemiContext {
  stEcgFinding?: string;
  suspectedStemi?: boolean;
  symptomOnsetMin?: number;
  transferToPciMin?: number;
  bleedingRisk?: boolean;
  recentStroke?: boolean;
  recentSurgeryOrTrauma?: boolean;
  activeBleeding?: boolean;
  systolicMmHg?: number;
  diastolicMmHg?: number;
}

@Injectable()
export class StemiFibrinolysisStrategy implements CdsRuleStrategy {
  readonly type = 'stemi-fibrinolysis';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as StemiContext;
    const isStemi = ctx.stEcgFinding?.toLowerCase() === 'stemi' || ctx.suspectedStemi === true;
    if (!isStemi) return [];

    const onset = ctx.symptomOnsetMin;
    const toPci = ctx.transferToPciMin;
    const pciInWindow = typeof toPci === 'number' && toPci <= PCI_WINDOW_MIN;
    const lateOnset = typeof onset === 'number' && onset > LYSIS_WINDOW_MIN;

    const contraindications: string[] = [];
    if (ctx.activeBleeding === true) contraindications.push('active bleeding');
    if (ctx.recentStroke === true) contraindications.push('recent stroke / intracranial event');
    if (ctx.recentSurgeryOrTrauma === true) contraindications.push('recent major surgery/trauma');
    if (ctx.bleedingRisk === true) contraindications.push('high bleeding risk');
    if (typeof ctx.systolicMmHg === 'number' && ctx.systolicMmHg > 180)
      contraindications.push(`uncontrolled SBP ${ctx.systolicMmHg}`);
    if (typeof ctx.diastolicMmHg === 'number' && ctx.diastolicMmHg > 110)
      contraindications.push(`uncontrolled DBP ${ctx.diastolicMmHg}`);

    const indicator: CdsIndicator = 'critical';
    let summary: string;
    let recommendation: string;

    const dapt =
      'Give aspirin 300 mg + a P2Y12 inhibitor (clopidogrel 300 mg load if lysing / ≤75 y, 75 mg if >75 y; ticagrelor/prasugrel for PCI) ' +
      'and anticoagulation (enoxaparin or UFH) per protocol. High-flow O₂ only if SpO₂ < 90%.';

    if (pciInWindow) {
      summary = 'STEMI — primary PCI pathway: PCI-capable centre reachable within 120 min';
      recommendation = `PCI-capable transfer in ~${toPci} min (≤120) → PRIMARY PCI is preferred. Activate the cath lab now and transfer immediately. ${dapt}`;
    } else if (lateOnset) {
      summary = 'STEMI — symptom onset > 12 h: fibrinolysis not routinely beneficial';
      recommendation =
        'Symptom onset > 12 h → routine fibrinolysis is not beneficial. Transfer for PCI (still indicated if ongoing ischaemia, ' +
        `haemodynamic/electrical instability, or cardiogenic shock). ${dapt}`;
    } else if (contraindications.length > 0) {
      summary = 'STEMI — fibrinolysis contraindicated: emergency transfer for PCI';
      recommendation =
        `PCI not reachable within 120 min BUT fibrinolysis is contraindicated (${contraindications.join(', ')}). Do NOT lyse — ` +
        `arrange emergency transfer for rescue/primary PCI as fast as possible. ${dapt}`;
    } else {
      summary = 'STEMI — fibrinolysis NOW (door-to-needle ≤ 10 min), then transfer for PCI';
      recommendation =
        'PCI not reachable within 120 min and no contraindication → give FIBRINOLYSIS immediately (door-to-needle ≤ 10 min): ' +
        'tenecteplase IV weight-adjusted bolus (halve the dose if age ≥ 75) — or streptokinase 1.5 MU IV over 30–60 min where ' +
        `tenecteplase is unavailable. Then transfer to a PCI centre for routine angiography within 2–24 h (pharmaco-invasive). ${dapt} ` +
        'If no reperfusion at 60–90 min (ST resolution < 50%, ongoing pain) → rescue PCI.';
    }

    const ref = rule.references[0] ?? {
      label: 'ESC Guidelines for the management of acute STEMI (2023)',
      url: 'https://academic.oup.com/eurheartj/article/44/38/3720/7243210',
    };
    const detail = `ECG-confirmed STEMI. ${recommendation}`;

    const { summary: outSummary, detail: outDetail } = resolveCardCopy(rule, req, {
      summary,
      detail,
    });

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
