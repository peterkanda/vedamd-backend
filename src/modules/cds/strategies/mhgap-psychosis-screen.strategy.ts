import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * WHO mhGAP psychosis assessment (PSY module).
 *
 *   Recognition criteria:
 *     One or more positive psychotic features (delusions, hallucinations,
 *     disorganised speech / behaviour, grossly disturbed behaviour),
 *     with onset ≤ 4 weeks classified as "acute / first-episode" and
 *     longer as "chronic / suspected schizophrenia".
 *
 *   Critical-escalation gate fires when ANY of:
 *     • imminent risk of harm to self or others
 *     • severe agitation
 *     • catatonia
 *     • refusal of food / fluid
 *     • acute medical illness suspected (delirium mimic — fever,
 *       altered mentation, recent substance use, recent head injury)
 *
 *   Tier output:
 *     CRITICAL — any of the escalation features above
 *                → urgent assessment, rule-out delirium / substance-
 *                  induced, consider IM antipsychotic + benzodiazepine
 *                  per mhGAP, urgent psychiatric review.
 *     WARNING  — psychotic features without escalation features
 *                → start oral haloperidol (low-dose) or olanzapine
 *                  per WHO mhGAP; arrange specialist review within
 *                  1–2 weeks; identify and treat comorbidity
 *                  (depression, substance use); psychoeducation +
 *                  family support.
 *     INFO     — no current psychotic features but at-risk profile
 *                → routine follow-up, watchful waiting, screen for
 *                  depression / substance use.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                     number ≥ 12
 *   context.psychoticFeatures            string[] — codes:
 *                                        'delusions', 'hallucinations',
 *                                        'disorganised-speech',
 *                                        'grossly-disturbed-behaviour'
 *   context.onsetWeeks                   number (0 if currently active)
 *   context.imminentHarmRiskToSelfOrOthers boolean
 *   context.severeAgitation              boolean
 *   context.catatonia                    boolean
 *   context.refusesFoodOrFluid           boolean
 *   context.feverPresent                 boolean (delirium mimic)
 *   context.recentHeadInjury             boolean (delirium mimic)
 *   context.recentSubstanceUse           boolean (substance-induced mimic)
 *   context.priorPsychoticEpisode        boolean
 */

const MIN_AGE_YEARS = 12;
const ACUTE_ONSET_WEEKS = 4;

const PSYCHOTIC_LABELS: Record<string, string> = {
  delusions: 'delusions',
  hallucinations: 'hallucinations',
  'disorganised-speech': 'disorganised speech',
  'grossly-disturbed-behaviour': 'grossly disturbed behaviour',
};

interface PsychosisContext {
  ageYears?: number;
  psychoticFeatures?: string[];
  onsetWeeks?: number;
  imminentHarmRiskToSelfOrOthers?: boolean;
  severeAgitation?: boolean;
  catatonia?: boolean;
  refusesFoodOrFluid?: boolean;
  feverPresent?: boolean;
  recentHeadInjury?: boolean;
  recentSubstanceUse?: boolean;
  priorPsychoticEpisode?: boolean;
}

@Injectable()
export class MhgapPsychosisScreenStrategy implements CdsRuleStrategy {
  readonly type = 'mhgap-psychosis-screen';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as PsychosisContext;
    if (typeof ctx.ageYears !== 'number' || ctx.ageYears < MIN_AGE_YEARS) return [];

    const features = Array.isArray(ctx.psychoticFeatures)
      ? ctx.psychoticFeatures.filter(
          (s): s is string => typeof s === 'string' && s in PSYCHOTIC_LABELS,
        )
      : [];

    const escalationReasons: string[] = [];
    if (ctx.imminentHarmRiskToSelfOrOthers === true) {
      escalationReasons.push('imminent risk of harm to self or others');
    }
    if (ctx.severeAgitation === true) escalationReasons.push('severe agitation');
    if (ctx.catatonia === true) escalationReasons.push('catatonia');
    if (ctx.refusesFoodOrFluid === true) escalationReasons.push('refusal of food / fluid');

    const mimicReasons: string[] = [];
    if (ctx.feverPresent === true) mimicReasons.push('fever (consider delirium / CNS infection)');
    if (ctx.recentHeadInjury === true) mimicReasons.push('recent head injury');
    if (ctx.recentSubstanceUse === true) mimicReasons.push('recent substance use');

    if (features.length === 0) {
      if (escalationReasons.length === 0 && mimicReasons.length === 0) {
        return [];
      }
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'Behavioural change without psychotic features — exclude medical mimic',
          'No psychotic features reported, but risk markers present: {{markers}}. Per WHO mhGAP, rule out a medical / ' +
            'organic cause first — capillary glucose, electrolytes, infection screen, head-injury assessment, substance-use ' +
            'history. Re-assess for emergent psychotic features.',
          { markers: [...escalationReasons, ...mimicReasons].join('; ') },
        ),
      ];
    }

    const labels = features.map((c) => PSYCHOTIC_LABELS[c]).join(', ');
    const acuteOnset =
      typeof ctx.onsetWeeks === 'number' && ctx.onsetWeeks >= 0 && ctx.onsetWeeks <= ACUTE_ONSET_WEEKS;
    const onsetLine =
      typeof ctx.onsetWeeks === 'number'
        ? `Onset ${ctx.onsetWeeks} weeks — ${acuteOnset ? 'acute / first-episode pattern' : 'chronic pattern, suspect schizophrenia or schizoaffective spectrum'}.`
        : 'Onset duration not supplied — establish duration to distinguish acute / first-episode vs chronic pattern.';

    if (escalationReasons.length > 0 || mimicReasons.length > 0) {
      return [
        this.buildCard(
          rule,
          req,
          'critical',
          'Acute psychosis with escalation features — urgent stabilisation',
          'Psychotic feature(s): {{features}}. {{onset}} Escalation / mimic features: {{escalation}}. Per WHO mhGAP PSY ' +
            'module: rule out delirium / substance-induced psychosis FIRST (glucose, infection screen, electrolytes, ' +
            'toxicology where available). If acute agitation or risk of harm, consider IM haloperidol 2–5 mg + IM ' +
            'lorazepam 1–2 mg (Kenya MoH first line where available). Ensure a safe environment with one-to-one supervision; ' +
            'avoid restraint where possible. Refer urgently for psychiatric review.',
          {
            features: labels,
            onset: onsetLine,
            escalation: [...escalationReasons, ...mimicReasons].join('; '),
          },
        ),
      ];
    }

    return [
      this.buildCard(
        rule,
        req,
        'warning',
        acuteOnset
          ? 'First-episode psychosis — start treatment + specialist review'
          : 'Chronic psychosis — review treatment + comorbidity',
        'Psychotic feature(s): {{features}}. {{onset}} Per WHO mhGAP PSY module: start low-dose oral antipsychotic ' +
          '(haloperidol 1.5–5 mg/day OR olanzapine 5–10 mg/day; titrate based on response and side effects). Provide ' +
          'psychoeducation and family support. Screen for and treat comorbid depression (PHQ-9), substance use (CAGE-AID) ' +
          'and ensure HIV / syphilis / TB screen as indicated. Refer for specialist mental-health review within 1–2 weeks. ' +
          'Document a safety plan and follow-up frequency.',
        { features: labels, onset: onsetLine },
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
      label: 'WHO mhGAP Intervention Guide (2.0)',
      url: 'https://www.who.int/publications/i/item/9789241549790',
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
