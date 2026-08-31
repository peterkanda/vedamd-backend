import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Asthma stepwise therapy — GINA 2024 Track 1 (ICS-formoterol based).
 * Recommends the GINA step from current treatment step plus control
 * markers (reliever overuse, night-waking). GINA's central safety
 * message: do NOT use SABA-only treatment; every step uses ICS.
 *
 * Anonymous-by-design. Reads only:
 *   context.diagnoses string[] (must contain "asthma") OR context.suspectedAsthma boolean
 *   context.gina.SABAUsePerWeek number (reliever days/week)
 *   context.gina.currentStep number (1–5)
 *   context.gina.nightWaking boolean
 *   context.symptomControl 'controlled' | 'partly' | 'uncontrolled'
 */

interface GinaContext {
  diagnoses?: unknown;
  suspectedAsthma?: boolean;
  gina?: {
    SABAUsePerWeek?: number;
    currentStep?: number;
    nightWaking?: boolean;
  };
  symptomControl?: string;
}

@Injectable()
export class AsthmaStepUpStrategy implements CdsRuleStrategy {
  readonly type = 'asthma-step-up';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as GinaContext;
    const diagnoses = Array.isArray(ctx.diagnoses)
      ? (ctx.diagnoses as unknown[]).map((d) => String(d).toLowerCase())
      : [];
    const hasAsthma = diagnoses.some((d) => d.includes('asthma')) || ctx.suspectedAsthma === true;
    if (!hasAsthma) return [];

    const gina = ctx.gina ?? {};
    const step =
      typeof gina.currentStep === 'number' ? Math.max(1, Math.min(5, gina.currentStep)) : 1;
    const sabaPerWeek = gina.SABAUsePerWeek;
    const control = ctx.symptomControl?.toLowerCase();
    const poorlyControlled =
      (typeof sabaPerWeek === 'number' && sabaPerWeek >= 3) ||
      gina.nightWaking === true ||
      control === 'uncontrolled' ||
      control === 'partly';

    const stepUp = poorlyControlled && step < 5;
    const targetStep = stepUp ? step + 1 : step;

    const TRACK1: Record<number, string> = {
      1: 'Step 1: as-needed low-dose ICS-formoterol (anti-inflammatory reliever) — no SABA-only.',
      2: 'Step 2: as-needed low-dose ICS-formoterol.',
      3: 'Step 3: low-dose MAINTENANCE ICS-formoterol + as-needed ICS-formoterol (MART).',
      4: 'Step 4: medium-dose maintenance ICS-formoterol + as-needed ICS-formoterol (MART).',
      5: 'Step 5: high-dose maintenance ICS-formoterol; add-on LAMA; refer for phenotyping ± biologic therapy.',
    };

    let indicator: CdsIndicator;
    let summary: string;
    let recommendation: string;

    if (targetStep >= 5) {
      indicator = 'warning';
      summary = 'Asthma — GINA Step 5: refer for severe-asthma assessment';
      recommendation =
        `${TRACK1[5]} Poorly controlled at high-dose ICS-formoterol → refer for specialist severe-asthma assessment (phenotyping, ` +
        'eosinophils/IgE, biologic eligibility). First confirm diagnosis, inhaler technique, adherence, and trigger/comorbidity control.';
    } else if (stepUp) {
      indicator = 'warning';
      summary = `Asthma — step up GINA ${step} → ${targetStep} (poor control)`;
      recommendation =
        `Reliever overuse / night-waking / poor control → before stepping up, CHECK inhaler technique, adherence, and triggers. ` +
        `Then step up: ${TRACK1[targetStep]} Reassess in 2–3 months and step down once controlled for ~3 months.`;
    } else {
      indicator = 'info';
      summary = `Asthma — maintain GINA Step ${step} (well controlled)`;
      recommendation =
        `Control adequate → maintain current therapy: ${TRACK1[step]} Reassess control, technique and adherence at review; consider ` +
        'stepping DOWN if well controlled for ~3 months. Never prescribe a SABA without ICS.';
    }

    const ref = rule.references[0] ?? {
      label: 'GINA Global Strategy for Asthma Management and Prevention (2024)',
      url: 'https://ginasthma.org/',
    };
    const detail = `${typeof sabaPerWeek === 'number' ? `Reliever use ${sabaPerWeek} day(s)/week. ` : ''}${recommendation}`;

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
