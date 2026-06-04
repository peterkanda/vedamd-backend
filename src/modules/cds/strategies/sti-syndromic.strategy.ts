import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * STI syndromic management — WHO STI 2021 guidelines + Kenya MoH
 * National Guidelines for the Management of Sexually Transmitted
 * Infections (2018, syndromic algorithm).
 *
 * The integrator selects ONE of five syndromes; the strategy
 * returns the WHO-recommended antimicrobial bundle plus partner
 * notification, HIV / syphilis / hepatitis testing, and the
 * counselling checklist.
 *
 * Syndromes covered:
 *
 *   1. urethral-discharge (males)
 *   2. vaginal-discharge (cervicitis / vaginitis)
 *   3. genital-ulcer
 *   4. lower-abdominal-pain (suspected PID)
 *   5. scrotal-swelling (epididymo-orchitis)
 *
 * Anonymous-by-design. Reads only:
 *
 *   context.ageYears                  number ≥ 0
 *   context.pregnant                  boolean
 *   context.suspectedStiSyndrome      one of the five literals above
 *   context.severePidFeatures         boolean (fever ≥ 38.5, peritonitis,
 *                                      pregnancy, IUD in situ, vomiting,
 *                                      tubo-ovarian abscess)
 *   context.testicularTorsionExcluded boolean (must be true for
 *                                      scrotal-swelling info card —
 *                                      otherwise we escalate to refer)
 *   context.cephalosporinAllergy      boolean
 *   context.macrolideAllergy          boolean
 *   context.penicillinAllergy         boolean
 */

type StiSyndrome =
  | 'urethral-discharge'
  | 'vaginal-discharge'
  | 'genital-ulcer'
  | 'lower-abdominal-pain'
  | 'scrotal-swelling';

interface StiContext {
  ageYears?: number;
  pregnant?: boolean;
  suspectedStiSyndrome?: StiSyndrome;
  severePidFeatures?: boolean;
  testicularTorsionExcluded?: boolean;
  cephalosporinAllergy?: boolean;
  macrolideAllergy?: boolean;
  penicillinAllergy?: boolean;
}

@Injectable()
export class StiSyndromicStrategy implements CdsRuleStrategy {
  readonly type = 'sti-syndromic';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as StiContext;
    const syn = ctx.suspectedStiSyndrome;
    if (!syn) return [];

    if (syn === 'urethral-discharge') {
      return [this.urethralDischarge(rule, req, ctx)];
    }
    if (syn === 'vaginal-discharge') {
      return [this.vaginalDischarge(rule, req, ctx)];
    }
    if (syn === 'genital-ulcer') {
      return [this.genitalUlcer(rule, req, ctx)];
    }
    if (syn === 'lower-abdominal-pain') {
      return [this.pid(rule, req, ctx)];
    }
    if (syn === 'scrotal-swelling') {
      return [this.scrotalSwelling(rule, req, ctx)];
    }
    return [];
  }

  private urethralDischarge(rule: CdsRule, req: CdsHookRequest, ctx: StiContext): CdsCard {
    const regimen =
      ctx.cephalosporinAllergy === true
        ? 'Cephalosporin allergy: gentamicin 240 mg IM single dose PLUS azithromycin 2 g orally single dose (covers both N. gonorrhoeae and C. trachomatis).'
        : 'Ceftriaxone 500 mg IM single dose (gonococcal cover) PLUS doxycycline 100 mg orally twice daily for 7 days (chlamydia cover). In Kenya since 2020, doxycycline has replaced single-dose azithromycin for chlamydia because of rising macrolide resistance.';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Male urethral discharge — treat for gonorrhoea + chlamydia today',
      'Syndromic management of male urethral discharge per WHO 2021. {{regimen}} Counsel abstinence for 7 days; treat all ' +
        'sexual partners from the preceding 60 days (expedited partner therapy where legal). Test for HIV, syphilis (RPR / ' +
        'treponemal RDT), hepatitis B surface antigen and hepatitis C antibody. Re-evaluate at day 7 — persistence suggests ' +
        'trichomoniasis (metronidazole 2 g orally single dose) or Mycoplasma genitalium (refer for resistance-guided ' +
        'therapy if available).',
      { regimen },
    );
  }

  private vaginalDischarge(rule: CdsRule, req: CdsHookRequest, ctx: StiContext): CdsCard {
    const cervRegimen =
      ctx.cephalosporinAllergy === true
        ? 'gentamicin 240 mg IM single dose PLUS azithromycin 2 g orally single dose'
        : 'ceftriaxone 500 mg IM single dose PLUS doxycycline 100 mg orally twice daily for 7 days (in pregnancy, replace doxycycline with azithromycin 1 g orally single dose)';
    const vagRegimen =
      ctx.pregnant === true
        ? 'metronidazole 400 mg orally twice daily for 7 days (avoid single 2 g dose in pregnancy) PLUS clotrimazole 500 mg vaginally single dose for candidiasis cover'
        : 'metronidazole 2 g orally single dose PLUS clotrimazole 500 mg vaginally single dose (or fluconazole 150 mg orally single dose)';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Vaginal discharge — treat for cervicitis + vaginitis syndromically',
      'WHO syndromic flowchart for vaginal discharge. If risk factors are present (new partner in 3 months, > 1 partner, ' +
        'symptomatic partner, age < 25 in high-prevalence setting) OR cervical motion tenderness on exam, cover cervicitis: ' +
        '{{cerv}}. Cover vaginitis: {{vag}}. Counsel abstinence for 7 days; treat partners. Test HIV, syphilis, HBsAg, ' +
        'anti-HCV. Re-evaluate at 7 days; if discharge persists, refer for speculum + microscopy.',
      { cerv: cervRegimen, vag: vagRegimen },
    );
  }

  private genitalUlcer(rule: CdsRule, req: CdsHookRequest, ctx: StiContext): CdsCard {
    const syphLine =
      ctx.penicillinAllergy === true
        ? 'Penicillin allergy: doxycycline 100 mg orally twice daily for 14 days (early disease) — desensitisation required in pregnancy.'
        : 'Benzathine penicillin G 2.4 MU IM single dose for primary syphilis.';
    const hsvLine = 'Aciclovir 400 mg orally three times daily for 7 days (first episode) or 5 days (recurrence).';
    const chancroidLine =
      ctx.macrolideAllergy === true
        ? 'Chancroid: ceftriaxone 250 mg IM single dose.'
        : 'Chancroid: azithromycin 1 g orally single dose.';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Genital ulcer — treat empirically for syphilis + HSV (+ chancroid where endemic)',
      'WHO syndromic management for genital ulcer disease. Bundle: {{syph}} {{hsv}} {{chancroid}} Test HIV + RPR / treponemal ' +
        'RDT (positive RPR confirms syphilis; consider re-testing in 4 weeks if early seronegative window). Counsel abstinence ' +
        'until lesions healed AND partner treated; offer HSV suppressive therapy if recurrent ≥ 6 episodes/year (aciclovir ' +
        '400 mg twice daily). Refer if ulcer fails to heal after 14 days or has atypical features (suspect malignancy, LGV, ' +
        'donovanosis).',
      { syph: syphLine, hsv: hsvLine, chancroid: chancroidLine },
    );
  }

  private pid(rule: CdsRule, req: CdsHookRequest, ctx: StiContext): CdsCard {
    if (ctx.severePidFeatures === true) {
      return this.buildCard(
        rule,
        req,
        'critical',
        'Severe PID features — admit for IV antibiotics + surgical review',
        'Severe pelvic inflammatory disease features present (fever ≥ 38.5 °C, peritonism, pregnancy, IUD in situ, vomiting, ' +
          'or suspected tubo-ovarian abscess). Admit. IV ceftriaxone 1 g once daily PLUS doxycycline 100 mg twice daily ' +
          '(orally if tolerated, otherwise IV) PLUS metronidazole 500 mg three times daily. Continue IV until 24–48 h ' +
          'afebrile + clinically improving, then complete a 14-day course orally (doxycycline + metronidazole; in pregnancy ' +
          'substitute erythromycin for doxycycline). Imaging (pelvic ultrasound) to exclude abscess. Surgical / gynaecology ' +
          'consult for IUD removal and drainage of any tubo-ovarian abscess.',
        {},
      );
    }
    return this.buildCard(
      rule,
      req,
      'critical',
      'Lower abdominal pain consistent with PID — start outpatient bundle',
      'Lower abdominal pain in a sexually active woman with no surgical abdomen warrants empirical PID treatment per WHO ' +
        'syndromic approach: ceftriaxone 500 mg IM single dose PLUS doxycycline 100 mg orally twice daily for 14 days PLUS ' +
        'metronidazole 400 mg orally twice daily for 14 days. In pregnancy substitute doxycycline with azithromycin 1 g single ' +
        'dose + 500 mg daily for 6 days. Review at 72 h — admit if no improvement. Test HIV, syphilis, HBsAg. Counsel ' +
        'abstinence + partner treatment. Pregnancy test if status unclear (history-only, not on the platform).',
      {},
    );
  }

  private scrotalSwelling(rule: CdsRule, req: CdsHookRequest, ctx: StiContext): CdsCard {
    if (ctx.testicularTorsionExcluded !== true) {
      return this.buildCard(
        rule,
        req,
        'critical',
        'Scrotal swelling — exclude testicular torsion first (urgent ultrasound / surgical review)',
        'Acute scrotal swelling can be testicular torsion (a surgical emergency — viable window is ~ 6 h). Refer immediately ' +
          'for urgent Doppler ultrasound + surgical review. Do NOT treat as STI until torsion is excluded; antibiotic delay ' +
          'while imaging is acceptable, surgical delay is not.',
        {},
      );
    }
    const regimen =
      ctx.cephalosporinAllergy === true
        ? 'gentamicin 240 mg IM single dose PLUS azithromycin 2 g orally single dose'
        : 'ceftriaxone 500 mg IM single dose PLUS doxycycline 100 mg orally twice daily for 10–14 days';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Acute epididymo-orchitis (STI-likely) — start dual cover',
      'Torsion has been excluded. In the under-35 male, epididymo-orchitis is most often gonococcal / chlamydial: {{regimen}}. ' +
        'In men > 35 or with risk for enteric pathogens (anal intercourse, recent UTI, BPH), add ciprofloxacin 500 mg orally ' +
        'twice daily for 10 days for E. coli cover. Scrotal support + NSAIDs symptomatically. Test HIV, syphilis, HBsAg, ' +
        'anti-HCV. Treat partners. Re-evaluate at 72 h; consider abscess drainage if pain or swelling progress.',
      { regimen },
    );
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
      label: 'WHO STI Guidelines (2021)',
      url: 'https://www.who.int/teams/global-hiv-hepatitis-and-stis-programmes/stis',
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
      source: { label: ref.label, url: ref.url, strength: ref.strength },
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
