import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * WHO TB symptom screen — adapted from the WHO 2021 systematic-screening
 * recommendations and the Kenya National TB programme symptom screen.
 *
 * Trigger rules:
 *
 *   General population
 *     • cough ≥ 14 days, OR
 *     • any TWO of {unintentional weight loss, drenching night sweats,
 *                   fever > 14 days, close contact with TB} fires the
 *       screen.
 *
 *   People living with HIV (PLHIV) — lower threshold per WHO four-symptom
 *   rule: ANY ONE of {current cough, weight loss, night sweats, fever}
 *   fires the screen.
 *
 * Output:
 *   • Card with indicator WARNING (the screen itself never indicates
 *     diagnosis; the recommendation is to confirm with WHO-recommended
 *     rapid diagnostics — Xpert MTB/RIF Ultra preferred).
 *   • Includes HIV-test recommendation if HIV status unknown.
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                number
 *   context.coughDays               number ≥ 0
 *   context.weightLossUnintentional boolean
 *   context.nightSweatsDrenching    boolean
 *   context.feverDays               number ≥ 0
 *   context.closeContactWithTb      boolean
 *   context.knownHivPositive        boolean | null  (null/undefined = unknown)
 */

const ADULT_COUGH_DAYS = 14;
const FEVER_DAYS_TRIGGER = 14;

interface TbContext {
  ageYears?: number;
  coughDays?: number;
  weightLossUnintentional?: boolean;
  nightSweatsDrenching?: boolean;
  feverDays?: number;
  closeContactWithTb?: boolean;
  knownHivPositive?: boolean | null;
}

@Injectable()
export class TbSymptomScreenStrategy implements CdsRuleStrategy {
  readonly type = 'tb-symptom-screen';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as TbContext;
    if (typeof ctx.ageYears !== 'number') return [];

    const plhiv = ctx.knownHivPositive === true;
    const hivUnknown = ctx.knownHivPositive === undefined || ctx.knownHivPositive === null;
    const cough = typeof ctx.coughDays === 'number' ? ctx.coughDays : 0;
    const fever = typeof ctx.feverDays === 'number' ? ctx.feverDays : 0;
    const weightLoss = ctx.weightLossUnintentional === true;
    const nightSweats = ctx.nightSweatsDrenching === true;
    const contact = ctx.closeContactWithTb === true;

    let triggered = false;
    const reasons: string[] = [];

    if (plhiv) {
      // WHO four-symptom rule.
      if (cough > 0) {
        triggered = true;
        reasons.push(`current cough (${cough} day${cough === 1 ? '' : 's'})`);
      }
      if (weightLoss) {
        triggered = true;
        reasons.push('unintentional weight loss');
      }
      if (nightSweats) {
        triggered = true;
        reasons.push('drenching night sweats');
      }
      if (fever > 0) {
        triggered = true;
        reasons.push(`fever (${fever} day${fever === 1 ? '' : 's'})`);
      }
    } else {
      if (cough >= ADULT_COUGH_DAYS) {
        triggered = true;
        reasons.push(`cough ≥ ${ADULT_COUGH_DAYS} days (${cough})`);
      }
      const otherFlags: string[] = [];
      if (weightLoss) otherFlags.push('unintentional weight loss');
      if (nightSweats) otherFlags.push('drenching night sweats');
      if (fever >= FEVER_DAYS_TRIGGER) {
        otherFlags.push(`fever ≥ ${FEVER_DAYS_TRIGGER} days (${fever})`);
      }
      if (contact) otherFlags.push('close TB contact');
      if (otherFlags.length >= 2) {
        triggered = true;
        reasons.push(`two or more risk markers: ${otherFlags.join(', ')}`);
      }
    }

    if (!triggered) return [];

    const indicator: CdsIndicator = 'warning';
    const populationLabel = plhiv
      ? 'WHO four-symptom rule (PLHIV)'
      : 'WHO/Kenya NTP symptom screen';

    const detailLines = [
      `${populationLabel} fired: ${reasons.join('; ')}.`,
      'Per WHO Guidelines for the Treatment of Tuberculosis and the Kenya National TB Programme, ' +
        'send sputum for Xpert MTB/RIF Ultra as the initial diagnostic test (smear microscopy is no ' +
        'longer first line). Where Xpert is unavailable, request fluorescence microscopy + culture; ' +
        'do not start empirical treatment without confirmation.',
    ];
    if (hivUnknown) {
      detailLines.push(
        'HIV status unknown — offer provider-initiated HIV testing and counselling at the same visit (PMTCT / TB-HIV co-management depend on it).',
      );
    }
    if (plhiv) {
      detailLines.push(
        'Patient is PLHIV — confirm and document current antiretroviral therapy; co-trimoxazole prophylaxis where indicated.',
      );
    }

    const ref = rule.references[0] ?? {
      label: 'WHO Consolidated Guidelines on TB (2021)',
      url: 'https://www.who.int/publications/i/item/9789240013131',
    };
    const { summary, detail } = resolveCardCopy(
      rule,
      req,
      {
        summary: 'TB symptom screen positive — confirm with Xpert MTB/RIF',
        detail: detailLines.join(' '),
      },
      { reasons: reasons.join('; ') },
    );

    return [
      {
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
      },
    ];
  }
}
