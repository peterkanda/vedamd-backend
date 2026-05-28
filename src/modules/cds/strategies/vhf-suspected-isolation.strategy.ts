import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Viral haemorrhagic fever (Ebola / Marburg / Lassa / CCHF / Rift Valley)
 * suspected-case recognition + immediate isolation bundle.
 *
 * This is the canonical CDS public-health-emergency use case: a febrile
 * patient with an epidemiological link must trigger IMMEDIATE isolation +
 * notification BEFORE routine phlebotomy or ward admission, because a
 * missed case endangers every staff member and contact. Per WHO VHF
 * clinical management + IHR (2005) + Kenya MOH IDSR / VHF contingency plan.
 *
 * WHO/Kenya-MOH suspected-case definition encoded here: acute fever
 * (or fever in the last 24-48 h) PLUS at least one epidemiological risk
 * factor within 21 days —
 *   • travel to / residence in an area with active VHF transmission
 *   • contact with a suspected / probable / confirmed VHF case
 *   • contact with a dead or sick body (funeral / burial)
 *   • healthcare exposure without appropriate PPE
 *   • contact with bats / non-human primates / bushmeat (filovirus)
 *   • tick bite / livestock slaughter (CCHF / Rift Valley)
 * — OR fever with otherwise-unexplained bleeding/haemorrhage.
 *
 * Anonymous-by-design. Reads only non-identifying signals:
 *   context.suspectedVhf            boolean (explicit sentinel)
 *   context.feverPresent            boolean
 *   context.vhfEndemicTravel21d     boolean
 *   context.vhfCaseContact21d       boolean
 *   context.funeralBodyContact21d   boolean
 *   context.healthcareExposureNoPpe boolean
 *   context.batPrimateBushmeatContact boolean
 *   context.tickBiteOrLivestock     boolean   (CCHF / RVF)
 *   context.unexplainedBleeding     boolean
 */
interface VhfContext {
  suspectedVhf?: boolean;
  feverPresent?: boolean;
  vhfEndemicTravel21d?: boolean;
  vhfCaseContact21d?: boolean;
  funeralBodyContact21d?: boolean;
  healthcareExposureNoPpe?: boolean;
  batPrimateBushmeatContact?: boolean;
  tickBiteOrLivestock?: boolean;
  unexplainedBleeding?: boolean;
}

@Injectable()
export class VhfSuspectedIsolationStrategy implements CdsRuleStrategy {
  readonly type = 'vhf-suspected-isolation';

  // eslint-disable-next-line @typescript-eslint/require-await
  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as VhfContext;

    const epiLinks: string[] = [];
    if (ctx.vhfEndemicTravel21d === true) epiLinks.push('travel/residence in a VHF-affected area (≤21 d)');
    if (ctx.vhfCaseContact21d === true) epiLinks.push('contact with a suspected/confirmed VHF case (≤21 d)');
    if (ctx.funeralBodyContact21d === true) epiLinks.push('funeral/body contact (≤21 d)');
    if (ctx.healthcareExposureNoPpe === true) epiLinks.push('healthcare exposure without PPE');
    if (ctx.batPrimateBushmeatContact === true) epiLinks.push('bat/primate/bushmeat contact');
    if (ctx.tickBiteOrLivestock === true) epiLinks.push('tick bite / livestock slaughter (CCHF/RVF)');

    const fever = ctx.feverPresent === true;
    const meetsCaseDef =
      ctx.suspectedVhf === true ||
      (fever && epiLinks.length > 0) ||
      (fever && ctx.unexplainedBleeding === true);

    if (!meetsCaseDef) return [];

    const trigger =
      ctx.suspectedVhf === true && epiLinks.length === 0
        ? 'clinician-flagged suspected VHF'
        : epiLinks.length > 0
          ? `fever + ${epiLinks.join('; ')}`
          : 'fever + unexplained bleeding';

    const summary =
      'SUSPECTED VIRAL HAEMORRHAGIC FEVER — isolate now, notify, activate VHF protocol';
    const detail =
      'Suspected-case definition met: {{trigger}}. ACT BEFORE further testing or admission: ' +
      '(1) ISOLATE immediately — single room with its own latrine/commode, door closed, restrict to one dedicated trained team, ' +
      'log everyone who enters. ' +
      '(2) DON appropriate PPE before any contact — fluid-resistant gown/coverall, double gloves, fluid-shield mask + goggles/face-shield, boots; ' +
      'trained doffing with a buddy/observer. ' +
      '(3) DO NOT perform routine phlebotomy, IM injections, or aerosol-generating procedures unless essential; no needle re-sheathing; minimise sharps. ' +
      '(4) NOTIFY the facility IPC lead + the county/national IHR focal point (Kenya MOH IDSR / public-health emergency line) within hours — VHF is immediately notifiable. ' +
      '(5) Do a bedside MALARIA RDT — malaria is the commonest alternative and a co-infection — but never delay isolation/notification for it. ' +
      '(6) SUPPORTIVE care only until diagnosis: aggressive oral/IV fluid + electrolyte replacement, paracetamol for fever — AVOID aspirin/NSAIDs and anticoagulants (bleeding risk). ' +
      '(7) Arrange referral/transfer to a designated VHF treatment/isolation unit; pre-notify the receiving unit. ' +
      '(8) Begin CONTACT TRACING — list contacts back 21 days; monitor daily for 21 days. ' +
      'Send diagnostic samples (Ebola/Marburg/Lassa/CCHF RT-PCR) only through the designated lab with category-A packaging and lab pre-notification. ' +
      'If confirmed Zaire ebolavirus: Inmazeb or Ebanga monoclonal therapy + Ervebo ring vaccination of contacts. ' +
      'For Lassa / CCHF: consider IV ribavirin early per protocol.';

    return [this.buildCard(rule, req, 'critical', summary, detail, { trigger })];
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
      label: 'WHO Clinical management of viral haemorrhagic fever',
      url: 'https://www.who.int/health-topics/haemorrhagic-fevers-viral',
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
