import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator, CodedReference } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Rabies post-exposure prophylaxis (PEP) — WHO position paper on
 * rabies vaccines (April 2018) + Kenya MoH rabies elimination
 * strategy + CDC ACIP.
 *
 * Anonymous-by-design. The integrator describes the exposure; the
 * strategy returns:
 *   1. CRITICAL — Category III exposure (transdermal bite, scratch
 *      breaking skin, mucous-membrane contamination, bat exposure):
 *        → Wound care now (≥ 15 min wash with soap + running water +
 *          virucidal e.g. povidone-iodine), full vaccine course AND
 *          rabies immunoglobulin (RIG) infiltrated locally where
 *          anatomically feasible.
 *
 *   2. CRITICAL — Category II exposure (nibbling on uncovered skin,
 *      minor scratch / abrasion without bleeding):
 *        → Wound care + full vaccine course. RIG NOT indicated.
 *
 *   3. INFO — Category I exposure (touching / feeding animal,
 *      intact-skin licks):
 *        → No PEP unless contact uncertain. Pre-exposure
 *          vaccination if ongoing exposure risk.
 *
 *   4. WARNING — PEP started elsewhere and patient missed a dose
 *      OR completed a previous full course presenting with new
 *      exposure: re-vaccination is abbreviated (2 doses days 0 + 3,
 *      no RIG).
 *
 * Reads only:
 *
 *   context.suspectedRabiesExposure       boolean (sentinel)
 *   context.exposureCategory              'I' | 'II' | 'III' | null
 *   context.bitingSpecies                 'dog' | 'cat' | 'bat' | 'wild-carnivore'
 *                                          | 'livestock' | 'rodent-lagomorph' | null
 *   context.bittenInRabiesEndemicArea     boolean
 *   context.animalProvoked                boolean
 *   context.animalAvailableForObservation boolean
 *   context.animalConfirmedRabid          boolean
 *   context.previousFullPepCourse         boolean
 *   context.previousPrePostExposureDate   string (ISO; optional informational)
 *   context.daysSinceExposure             number (optional)
 *   context.weightKg                      number (for paediatric RIG dosing)
 *   context.immunocompromised             boolean
 *   context.pregnant                      boolean
 *   context.tetanusUpToDate               boolean
 */

interface RabiesContext {
  suspectedRabiesExposure?: boolean;
  exposureCategory?: 'I' | 'II' | 'III' | null;
  bitingSpecies?:
    | 'dog'
    | 'cat'
    | 'bat'
    | 'wild-carnivore'
    | 'livestock'
    | 'rodent-lagomorph'
    | null;
  bittenInRabiesEndemicArea?: boolean;
  animalProvoked?: boolean;
  animalAvailableForObservation?: boolean;
  animalConfirmedRabid?: boolean;
  previousFullPepCourse?: boolean;
  previousPrePostExposureDate?: string;
  daysSinceExposure?: number;
  weightKg?: number;
  immunocompromised?: boolean;
  pregnant?: boolean;
  tetanusUpToDate?: boolean;
}

const CODINGS_PEP: CodedReference[] = [
  {
    system: 'http://hl7.org/fhir/sid/icd-10',
    code: 'Z20.3',
    display: 'Contact with and (suspected) exposure to rabies',
    kind: 'diagnosis',
  },
  {
    system: 'http://hl7.org/fhir/sid/icd-10',
    code: 'Z29.2',
    display: 'Anti-rabies prophylactic immunisation',
    kind: 'procedure',
  },
  {
    system: 'http://id.who.int/icd/release/11/mms',
    code: '1G40',
    display: 'Rabies',
    kind: 'diagnosis',
  },
  {
    system: 'http://snomed.info/sct',
    code: '14168008',
    display: 'Rabies (disorder)',
    kind: 'diagnosis',
  },
  {
    system: 'http://snomed.info/sct',
    code: '417165001',
    display: 'Animal bite (disorder)',
    kind: 'finding',
  },
  {
    system: 'http://snomed.info/sct',
    code: '313160007',
    display: 'Rabies vaccination (procedure)',
    kind: 'procedure',
  },
  {
    system: 'http://snomed.info/sct',
    code: '417303002',
    display: 'Rabies immunoglobulin administration (procedure)',
    kind: 'procedure',
  },
  {
    system: 'http://whocc.no/atc',
    code: 'J07BG01',
    display: 'Rabies vaccine (purified Vero cell)',
    kind: 'drug',
  },
  {
    system: 'http://whocc.no/atc',
    code: 'J06BB05',
    display: 'Rabies immunoglobulin (human)',
    kind: 'drug',
  },
];

@Injectable()
export class RabiesPepStrategy implements CdsRuleStrategy {
  readonly type = 'rabies-pep';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as RabiesContext;
    if (ctx.suspectedRabiesExposure !== true) return [];

    const cat = ctx.exposureCategory ?? this.inferCategory(ctx);

    if (cat === 'I' && ctx.animalConfirmedRabid !== true) {
      return [this.categoryICard(rule, req)];
    }

    if (ctx.previousFullPepCourse === true) {
      return [this.boosterCard(rule, req, ctx)];
    }

    if (cat === 'II') return [this.categoryIICard(rule, req, ctx)];
    if (cat === 'III' || ctx.animalConfirmedRabid === true) {
      return [this.categoryIIICard(rule, req, ctx)];
    }

    return [
      this.buildCard(
        rule,
        req,
        'warning',
        'Animal exposure — categorise per WHO before deciding PEP',
        'Insufficient information to classify exposure. Per WHO 2018 categories: I = touching / feeding intact-skin licks (no PEP); ' +
          'II = nibbling on uncovered skin, minor scratch without bleeding (wound care + vaccine); III = transdermal bite or scratch, ' +
          'mucous-membrane / broken-skin contamination, or any bat exposure (wound care + vaccine + RIG). Document species, location ' +
          "of injury, whether the animal was provoked, whether it can be observed for 10 days, and the patient's tetanus status.",
        {},
        CODINGS_PEP,
      ),
    ];
  }

  private inferCategory(ctx: RabiesContext): 'I' | 'II' | 'III' | null {
    if (ctx.bitingSpecies === 'bat') return 'III';
    if (ctx.bitingSpecies === 'rodent-lagomorph') return 'I';
    return null;
  }

  private categoryICard(rule: CdsRule, req: CdsHookRequest): CdsCard {
    return this.buildCard(
      rule,
      req,
      'info',
      'WHO Category I — no PEP required',
      'Touching or feeding an animal, or licks on intact skin — no risk of transmission. Reassure patient and verify history. ' +
        'Consider pre-exposure prophylaxis (3-dose vaccine schedule: days 0, 7, 21–28) ONLY if there is sustained occupational ' +
        '(veterinary, laboratory, wildlife) or travel exposure to high-risk settings. If exposure category is uncertain or the ' +
        'patient is anxious about uncertain contact, escalate to Category II.',
      {},
      CODINGS_PEP,
    );
  }

  private categoryIICard(rule: CdsRule, req: CdsHookRequest, ctx: RabiesContext): CdsCard {
    const tetLine =
      ctx.tetanusUpToDate === false
        ? ' Tetanus is not up-to-date — administer tetanus toxoid 0.5 mL IM and consider tetanus immunoglobulin per local guidance.'
        : '';
    return this.buildCard(
      rule,
      req,
      'critical',
      'WHO Category II exposure — wound care + full rabies vaccine course (NO RIG)',
      'Minor scratch or nibbling on uncovered skin without bleeding. (1) Wound care: wash with soap and running water for at least ' +
        '15 minutes, then apply a virucidal agent (povidone-iodine, 70 % alcohol or quaternary-ammonium solution). Do not suture if ' +
        'possible; if essential, suture loosely and only after RIG is infiltrated. (2) Vaccine — Essen 5-dose IM schedule (days 0, ' +
        '3, 7, 14, 28) using purified Vero-cell vaccine 0.5 mL IM into the deltoid (or anterolateral thigh in children), OR the ' +
        'WHO-preferred 2-2-2-0-2 intradermal regimen (Updated Thai Red Cross — 0.1 mL ID at two sites on days 0, 3, 7 and 28) which ' +
        'is dose-sparing and used widely in Kenya. (3) RIG is NOT indicated in Category II. (4) Counsel against scratching / ' +
        'massaging the wound; report any new neurological symptoms.{{tetanus}} Continue the vaccine course even if the animal is ' +
        'later confirmed rabies-free — completion is harmless and protective for future exposures.',
      { tetanus: tetLine },
      CODINGS_PEP,
    );
  }

  private categoryIIICard(rule: CdsRule, req: CdsHookRequest, ctx: RabiesContext): CdsCard {
    const rigDose =
      typeof ctx.weightKg === 'number'
        ? `Human RIG (HRIG) 20 IU/kg = ${(20 * ctx.weightKg).toFixed(0)} IU (or equine RIG 40 IU/kg). Infiltrate AS MUCH AS ANATOMICALLY POSSIBLE into and around each wound; inject any remaining volume IM at a site distant from the vaccine.`
        : 'Human RIG 20 IU/kg (or equine RIG 40 IU/kg) — infiltrate AS MUCH AS ANATOMICALLY POSSIBLE into and around each wound; inject any remaining volume IM at a site distant from the vaccine.';
    const pregLine =
      ctx.pregnant === true
        ? ' Pregnancy is NOT a contraindication — modern rabies vaccines and RIG are safe in pregnancy and breastfeeding.'
        : '';
    const immunoLine =
      ctx.immunocompromised === true
        ? ' Immunocompromised patient — give the Essen 5-dose IM regimen (NOT the abbreviated regimens), ALWAYS with RIG, and check antibody response on day 14–28 (target ≥ 0.5 IU/mL).'
        : '';
    const tetLine =
      ctx.tetanusUpToDate === false
        ? ' Tetanus is not up-to-date — administer tetanus toxoid 0.5 mL IM and consider tetanus immunoglobulin per local guidance.'
        : '';
    const lateLine =
      typeof ctx.daysSinceExposure === 'number' && ctx.daysSinceExposure > 7
        ? ` Although ${ctx.daysSinceExposure} days have elapsed since the exposure, PEP is NEVER too late as long as symptoms have not started. Start the full vaccine course + RIG today.`
        : ' Start PEP TODAY — every day of delay carries risk; rabies is virtually 100 % fatal once symptoms appear.';
    return this.buildCard(
      rule,
      req,
      'critical',
      'WHO Category III exposure — wound care + RIG + full vaccine course',
      'High-risk transdermal exposure (bite, scratch breaking skin, mucous-membrane or broken-skin contamination, or ANY bat ' +
        'exposure). Steps in order: (1) Wound care — wash with soap and running water for at least 15 minutes, then virucidal ' +
        '(povidone-iodine, 70 % alcohol, or quaternary-ammonium). Do NOT suture if avoidable. (2) RIG: {{rig}} (3) Vaccine — start ' +
        'the same day: WHO 1-1-1-1 IM 4-dose schedule (days 0, 3, 7, 14–28) using purified Vero-cell vaccine, OR the dose-sparing ' +
        'intradermal Updated Thai Red Cross regimen (days 0, 3, 7, 28). Use a DIFFERENT limb / site from the RIG. (4) Counsel — ' +
        'complete the full course; report any new symptoms (paraesthesia at the wound site, hydrophobia, agitation) IMMEDIATELY.{{late}}{{preg}}{{immuno}}{{tetanus}} ' +
        'Notify public-health surveillance; if the animal is available, observe for 10 days — if it remains healthy, vaccine may ' +
        'be stopped (but RIG already given is not reversed).',
      {
        rig: rigDose,
        late: lateLine,
        preg: pregLine,
        immuno: immunoLine,
        tetanus: tetLine,
      },
      CODINGS_PEP,
    );
  }

  private boosterCard(rule: CdsRule, req: CdsHookRequest, _ctx: RabiesContext): CdsCard {
    return this.buildCard(
      rule,
      req,
      'critical',
      'Re-exposure after prior full PEP / pre-exposure — abbreviated booster (NO RIG)',
      'Previous full WHO-compliant PEP course or pre-exposure vaccination. The booster regimen is 2 doses of rabies vaccine 0.5 mL ' +
        'IM (or 0.1 mL ID at one site) on days 0 and 3. RIG is NOT indicated. Wound care as for any exposure: wash with soap and ' +
        "running water for ≥ 15 minutes + virucidal. Document the new exposure and update the patient's immunisation record. " +
        'Counsel return-immediately signs of rabies.',
      {},
      CODINGS_PEP,
    );
  }

  private buildCard(
    rule: CdsRule,
    req: CdsHookRequest,
    indicator: CdsIndicator,
    defaultSummary: string,
    defaultDetail: string,
    vars: Record<string, string | number | boolean | null | undefined>,
    codings: CodedReference[],
  ): CdsCard {
    const ref = rule.references[0] ?? {
      label: 'WHO — Rabies vaccines: WHO position paper, April 2018',
      url: 'https://www.who.int/publications/i/item/who-wer-9316-201-220',
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
          codings,
        },
      },
    };
  }
}
