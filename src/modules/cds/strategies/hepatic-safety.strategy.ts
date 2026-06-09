import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import { HepaticDoseService } from '../../hepatic-dose/hepatic-dose.service';
import type { ChildPughClass, HepaticDoseRecord } from '../../hepatic-dose/hepatic-dose.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import type { CdsRuleStrategy } from './types';

/**
 * Hepatic-safety strategy — the liver-disease counterpart to renal-safety.
 *
 * Activates only when the caller signals hepatic impairment: a Child-Pugh
 * class (context.childPughClass = 'A'|'B'|'C'), an acute-liver-failure flag,
 * or a cirrhosis/liver-disease boolean. For each proposed/current medication
 * that has a hepatic-dose record, it surfaces that record's OWN reviewed
 * guidance — the class-specific adjustment when a class is known, the
 * acute-failure guidance when acute failure is flagged, otherwise the
 * headline. The card indicator follows the record's worstClassDecision.
 *
 * This strategy invents no thresholds: every clinical statement comes verbatim
 * from the cited hepatic-dose bundle. Drugs without a hepatic-dose record are
 * silent.
 */
const DECISION_INDICATOR: Record<HepaticDoseRecord['worstClassDecision'], CdsIndicator> = {
  contraindicated: 'critical',
  avoid: 'critical',
  'reduce-dose': 'warning',
  'use-with-caution': 'info',
};

@Injectable()
export class HepaticSafetyStrategy implements CdsRuleStrategy {
  readonly type = 'hepatic-safety';

  constructor(private readonly hepatic: HepaticDoseService) {}

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = req.context;
    const childPugh = readChildPughClass(ctx);
    const acuteFailure = readAcuteFailure(ctx);
    // Only fire when the caller has signalled liver impairment.
    if (childPugh === undefined && !acuteFailure && !readHepaticFlag(ctx)) return [];

    const slugs = extractMedicationSlugs(ctx);
    if (slugs.length === 0) return [];

    const cards: CdsCard[] = [];
    for (const slug of slugs) {
      const rec = this.hepatic.getByDrugSlug(slug);
      if (!rec) continue;
      cards.push(buildCard(rule, rec, childPugh, acuteFailure));
    }
    return cards;
  }
}

function buildCard(
  rule: CdsRule,
  rec: HepaticDoseRecord,
  childPugh: ChildPughClass | undefined,
  acuteFailure: boolean,
): CdsCard {
  const parts: string[] = [];
  let indicator = DECISION_INDICATOR[rec.worstClassDecision];

  if (acuteFailure && rec.acuteFailureGuidance) {
    indicator = 'critical';
    parts.push(`**Acute liver failure.** ${rec.acuteFailureGuidance}`);
  } else if (childPugh) {
    const g = rec.guidance.find((x) => x.class === childPugh);
    if (g) {
      parts.push(`**Child-Pugh ${childPugh}.** ${g.adjustment}`);
      if (g.notes) parts.push(g.notes);
    } else {
      parts.push(rec.oneLiner);
    }
  } else {
    parts.push(rec.oneLiner);
  }

  if (rec.monitoring) parts.push(`**Monitoring.** ${rec.monitoring}`);
  if (rec.alternatives && rec.alternatives.length > 0) {
    parts.push(`**Alternatives.** ${rec.alternatives.join('; ')}`);
  }

  const label = acuteFailure
    ? ' (acute liver failure)'
    : childPugh
      ? ` (Child-Pugh ${childPugh})`
      : '';
  return {
    summary: `Hepatic dosing: ${rec.drug}${label}`,
    detail: parts.join('\n\n'),
    indicator,
    source: {
      label:
        rule.references[0]?.label ?? rec.references[0]?.label ?? 'VedaMD hepatic-dose registry',
      url: rule.references[0]?.url,
    },
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

function readChildPughClass(context: Record<string, unknown>): ChildPughClass | undefined {
  const keys = ['childPughClass', 'childPugh', 'childPughCls'];
  for (const k of keys) {
    const v = context[k];
    if (typeof v === 'string') {
      const u = v.trim().toUpperCase();
      if (u === 'A' || u === 'B' || u === 'C') return u as ChildPughClass;
    }
  }
  return undefined;
}

function readAcuteFailure(context: Record<string, unknown>): boolean {
  if (context.acuteLiverFailure === true || context.fulminantHepaticFailure === true) return true;
  const v = context.hepaticFailure;
  return typeof v === 'string' && v.trim().toLowerCase() === 'acute';
}

function readHepaticFlag(context: Record<string, unknown>): boolean {
  return (
    context.cirrhosis === true ||
    context.hepaticImpairment === true ||
    context.liverDisease === true
  );
}

function extractMedicationSlugs(context: Record<string, unknown>): string[] {
  const fields = ['medications', 'proposed', 'current', 'draftMedications', 'currentMedications'];
  const out: string[] = [];
  for (const f of fields) {
    const v = context[f];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string') out.push(item);
      }
    }
  }
  return out;
}
