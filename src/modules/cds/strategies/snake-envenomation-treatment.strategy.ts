import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Snakebite envenomation — antivenom protocol (WHO Africa guidelines).
 * Antivenom is indicated only once SYSTEMIC envenomation is evident
 * (incoagulable blood on 20-minute whole-blood clotting test,
 * neurotoxicity, shock/spontaneous bleeding, or rapidly advancing local
 * necrosis). Without systemic signs, observe — antivenom carries
 * anaphylaxis risk.
 *
 * Anonymous-by-design. Reads only:
 *   context.envenomationFeatures string[] (neurotoxicity, bleeding, shock, local necrosis…)
 *   context.wbct20MinResult 'clotted' | 'unclotted' (20-minute WBCT)
 *   context.suspectedSnakebite boolean (sentinel for the observe pathway)
 */

interface SnakeContext {
  envenomationFeatures?: unknown;
  wbct20MinResult?: string;
  suspectedSnakebite?: boolean;
}

@Injectable()
export class SnakeEnvenomationTreatmentStrategy implements CdsRuleStrategy {
  readonly type = 'snake-envenomation-treatment';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as SnakeContext;
    const features = Array.isArray(ctx.envenomationFeatures)
      ? (ctx.envenomationFeatures as unknown[]).map((f) => String(f).toLowerCase())
      : [];
    const wbct = ctx.wbct20MinResult?.toLowerCase();
    const incoagulable = wbct === 'unclotted' || wbct === 'incoagulable';
    const hasSystemic = features.length > 0 || incoagulable;

    if (!hasSystemic && ctx.suspectedSnakebite !== true) return [];

    let indicator: CdsIndicator;
    let summary: string;
    let recommendation: string;

    if (hasSystemic) {
      indicator = 'critical';
      summary = 'Snakebite — systemic envenomation: give polyvalent antivenom now';
      recommendation =
        'Systemic envenomation present → give appropriate polyvalent antivenom: typically 50–100 mL (reconstituted) by SLOW IV ' +
        'infusion over ~30 min (or equivalent vials per product instructions). Before starting, draw up adrenaline 0.5 mg IM and ' +
        'have chlorphenamine + hydrocortisone ready to treat antivenom anaphylaxis. Reassess at 1–2 h: repeat the same dose if ' +
        'coagulopathy persists (recheck 20-min WBCT at 6 h) or neurotoxicity/bleeding has not reversed. For neurotoxic bites add a ' +
        'trial of atropine + neostigmine. Supportive care: airway/ventilation for bulbar/respiratory paralysis, IV fluids for shock, ' +
        'tetanus prophylaxis, and DO NOT use tourniquets, incision or electrotherapy. Immobilise the limb and elevate.';
    } else {
      indicator = 'warning';
      summary = 'Snakebite — no systemic signs yet: observe ≥ 24 h, repeat 20-min WBCT';
      recommendation =
        'No systemic envenomation features yet → antivenom is NOT indicated at this point. Admit and observe for at least 24 h. ' +
        'Repeat the 20-minute whole-blood clotting test and neurological examination every 6 h (and on any new symptom). Give ' +
        'antivenom immediately if incoagulable blood, neurotoxicity, spontaneous bleeding, shock, or rapidly advancing local ' +
        'swelling/necrosis develops. Tetanus prophylaxis, analgesia (avoid NSAIDs/aspirin), and limb immobilisation.';
    }

    const ref = rule.references[0] ?? {
      label: 'WHO Guidelines for the prevention and clinical management of snakebite in Africa',
      url: 'https://www.afro.who.int/publications/guidelines-prevention-and-clinical-management-snakebite-africa',
    };
    const detail = `${features.length ? `Features: ${features.join(', ')}. ` : ''}${incoagulable ? '20-min WBCT: incoagulable. ' : ''}${recommendation}`;

    const { summary: outSummary, detail: outDetail } = resolveCardCopy(rule, req, { summary, detail });

    return [
      {
        summary: outSummary,
        indicator,
        detail: outDetail.replace(/\s+/g, ' ').trim(),
        source: { label: ref.label, url: ref.url },
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
