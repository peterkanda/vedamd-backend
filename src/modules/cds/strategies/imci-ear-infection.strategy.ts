import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator, CodedReference } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * IMCI: ear problem in children under 5.
 *
 *   WHO IMCI Chart Booklet (2014) + WHO Pocket Book of Hospital
 *   Care for Children (2nd edn) + AAP Clinical Practice Guideline:
 *   Diagnosis and Management of Acute Otitis Media (2013) + Kenya
 *   MoH IMCI.
 *
 *   Ladder:
 *     1. CRITICAL — mastoiditis: tender swelling behind the ear
 *        (outward-pushed pinna in young child) — admit for IV
 *        antibiotics + urgent ENT review.
 *     2. CRITICAL — acute ear infection (AOM): pus draining from
 *        the ear < 14 days OR ear pain + bulging tympanic membrane
 *        on otoscopy — oral amoxicillin (or oral amoxi-clav if
 *        treatment failure or severe features).
 *     3. WARNING — chronic ear infection (CSOM): pus draining for
 *        ≥ 14 days — DRY wicking + topical ciprofloxacin ear
 *        drops (NOT systemic antibiotics per WHO).
 *     4. INFO — no ear infection: reassure + counsel return
 *        triggers.
 *
 *   Anonymous context:
 *     suspectedEarProblem        boolean (sentinel)
 *     ageMonths                  number (must be < 60 for IMCI band)
 *     weightKg                   number (for paediatric dosing)
 *     earPain                    boolean
 *     pusFromEar                 boolean
 *     pusDurationDays            number (optional — ≥ 14 = chronic)
 *     tenderSwellingBehindEar    boolean
 *     bulgingTympanicMembrane    boolean (otoscopic finding)
 *     bilateralAom               boolean
 *     priorAomFailedAmoxicillin  boolean
 *     ageMonthsLessThan6         boolean (treat all AOM with antibiotic
 *                                if < 6 months)
 *     amoxicillinAllergyIge      boolean (IgE-mediated rash / anaphylaxis)
 */

interface EarContext {
  suspectedEarProblem?: boolean;
  ageMonths?: number;
  weightKg?: number;
  earPain?: boolean;
  pusFromEar?: boolean;
  pusDurationDays?: number;
  tenderSwellingBehindEar?: boolean;
  bulgingTympanicMembrane?: boolean;
  bilateralAom?: boolean;
  priorAomFailedAmoxicillin?: boolean;
  ageMonthsLessThan6?: boolean;
  amoxicillinAllergyIge?: boolean;
}

const CODINGS_AOM: CodedReference[] = [
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'H66.0', display: 'Acute suppurative otitis media', kind: 'diagnosis' },
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'H66.9', display: 'Otitis media, unspecified', kind: 'diagnosis' },
  { system: 'http://snomed.info/sct', code: '3110003', display: 'Acute suppurative otitis media (disorder)', kind: 'diagnosis' },
  { system: 'http://whocc.no/atc', code: 'J01CA04', display: 'Amoxicillin', kind: 'drug' },
];

const CODINGS_CSOM: CodedReference[] = [
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'H66.1', display: 'Chronic tubotympanic suppurative otitis media', kind: 'diagnosis' },
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'H66.3', display: 'Other chronic suppurative otitis media', kind: 'diagnosis' },
  { system: 'http://snomed.info/sct', code: '46070000', display: 'Chronic suppurative otitis media (disorder)', kind: 'diagnosis' },
  { system: 'http://whocc.no/atc', code: 'S02AA15', display: 'Ciprofloxacin (otic)', kind: 'drug' },
];

const CODINGS_MASTOID: CodedReference[] = [
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'H70', display: 'Mastoiditis and related conditions', kind: 'diagnosis' },
  { system: 'http://snomed.info/sct', code: '13658006', display: 'Mastoiditis (disorder)', kind: 'diagnosis' },
  { system: 'http://whocc.no/atc', code: 'J01DD04', display: 'Ceftriaxone (IM/IV)', kind: 'drug' },
];

const MAX_IMCI_AGE_MONTHS = 60;

function amoxicillinDose(wt?: number): string {
  if (typeof wt !== 'number') return 'amoxicillin 80–90 mg/kg/day divided into 2 doses for 5 days (10 days if < 2 years or severe — bulging membrane / bilateral / pus draining)';
  const totalDaily = Math.round(85 * wt);
  return `amoxicillin ${Math.round(totalDaily / 2)} mg twice daily (85 mg/kg/day × ${wt} kg) for 5–10 days`;
}

function coAmoxiclavDose(wt?: number): string {
  if (typeof wt !== 'number') return 'amoxicillin-clavulanate 90 mg/kg/day of amoxicillin component, twice daily for 10 days';
  const total = Math.round(90 * wt);
  return `amoxicillin-clavulanate (7:1 ratio) ${Math.round(total / 2)} mg amoxicillin component twice daily for 10 days`;
}

@Injectable()
export class ImciEarInfectionStrategy implements CdsRuleStrategy {
  readonly type = 'imci-ear-infection';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as EarContext;
    if (ctx.suspectedEarProblem !== true) return [];
    if (typeof ctx.ageMonths !== 'number' || ctx.ageMonths < 0 || ctx.ageMonths >= MAX_IMCI_AGE_MONTHS) {
      return [];
    }

    // 1. Mastoiditis.
    if (ctx.tenderSwellingBehindEar === true) {
      return [this.mastoiditisCard(rule, req, ctx)];
    }

    // 2. Acute / 3. Chronic ear infection.
    if (ctx.pusFromEar === true) {
      if (typeof ctx.pusDurationDays === 'number' && ctx.pusDurationDays >= 14) {
        return [this.csomCard(rule, req)];
      }
      return [this.aomCard(rule, req, ctx)];
    }

    if (ctx.earPain === true || ctx.bulgingTympanicMembrane === true) {
      return [this.aomCard(rule, req, ctx)];
    }

    // 4. No infection.
    return [
      this.buildCard(
        rule,
        req,
        'info',
        'No ear infection — reassure and counsel',
        'No features of acute or chronic ear infection. Counsel the carer that ear pain, drainage of pus, or a child pulling at the ' +
          'ear should bring them back for review. Encourage exclusive breastfeeding to 6 months and avoidance of bottle-propping ' +
          '(both reduce AOM risk). Up-to-date pneumococcal and influenza vaccination reduces recurrent AOM.',
        {},
        CODINGS_AOM,
      ),
    ];
  }

  private mastoiditisCard(rule: CdsRule, req: CdsHookRequest, ctx: EarContext): CdsCard {
    const wt = ctx.weightKg;
    const ceftLine =
      typeof wt === 'number'
        ? `Ceftriaxone ${Math.min(2000, Math.round(50 * wt))} mg IV / IM once daily (50 mg/kg, max 2 g) until clinically improved + oral step-down to a total of 14 days.`
        : 'Ceftriaxone 50 mg/kg IV / IM once daily (max 2 g) until clinically improved + oral step-down to a total of 14 days.';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Acute mastoiditis — admit + IV antibiotics + urgent ENT review',
      'Tender swelling behind the ear (often with an outward-pushed pinna) is mastoiditis until proven otherwise — a complication of ' +
        'untreated / under-treated acute otitis media that can progress to intracranial extension (sigmoid sinus thrombosis, ' +
        'meningitis, brain abscess). Admit. {{abx}} Add metronidazole IV for anaerobic cover if intracranial extension is ' +
        'suspected. Imaging: contrast-enhanced CT or MRI of the temporal bone. Urgent ENT referral — myringotomy ± mastoidectomy ' +
        'may be required if not improving within 48 hours of IV antibiotics. Analgesia: paracetamol 15 mg/kg every 6 hours and ' +
        'ibuprofen 10 mg/kg every 8 hours (unless contraindicated). Counsel the family that any new symptoms (severe headache, ' +
        'altered mental state, repeated vomiting, neck stiffness, facial-nerve palsy) need immediate review.',
      { abx: ceftLine },
      CODINGS_MASTOID,
    );
  }

  private aomCard(rule: CdsRule, req: CdsHookRequest, ctx: EarContext): CdsCard {
    const wt = ctx.weightKg;
    const failedFirstLine = ctx.priorAomFailedAmoxicillin === true;
    const regimen = failedFirstLine ? coAmoxiclavDose(wt) : amoxicillinDose(wt);
    const allergyLine =
      ctx.amoxicillinAllergyIge === true
        ? ' Amoxicillin IgE-mediated allergy — substitute azithromycin 10 mg/kg on day 1 then 5 mg/kg once daily for 4 days, OR clarithromycin 15 mg/kg/day divided twice daily for 10 days. Clindamycin 30 mg/kg/day divided three times daily is an alternative.'
        : '';
    const watchfulWaitLine =
      ctx.ageMonths !== undefined &&
      ctx.ageMonths >= 24 &&
      ctx.bilateralAom !== true &&
      ctx.pusFromEar !== true &&
      ctx.priorAomFailedAmoxicillin !== true
        ? ' Age ≥ 2 years, unilateral, no otorrhoea — AAP 2013 supports "watchful waiting" for 48–72 hours with analgesia ONLY if the family can return promptly should symptoms worsen.'
        : '';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Acute otitis media (AOM) — oral antibiotic + analgesia',
      'Acute otitis media (pus < 14 days OR bulging tympanic membrane + ear pain). Treatment: {{regimen}}. Analgesia: paracetamol 15 ' +
        'mg/kg every 6 hours and / or ibuprofen 10 mg/kg every 8 hours; benzocaine ear drops are NOT recommended in young children. ' +
        'Counsel return-immediately signs: tender swelling behind the ear, fever > 39 °C with reduced activity, vomiting, child ' +
        'pulling repeatedly at the ear with high distress, drowsiness, neck stiffness. Review at 48–72 hours. WHO recommends no ' +
        'topical antibiotic / steroid drops in AOM with a perforated drum; rinse only if pus is profuse.{{watchful}}{{allergy}}',
      { regimen, watchful: watchfulWaitLine, allergy: allergyLine },
      CODINGS_AOM,
    );
  }

  private csomCard(rule: CdsRule, req: CdsHookRequest): CdsCard {
    return this.buildCard(
      rule,
      req,
      'warning',
      'Chronic suppurative otitis media (CSOM) — dry wicking + topical ciprofloxacin (NO oral antibiotic)',
      'Pus draining for ≥ 14 days = chronic suppurative otitis media. WHO 2017 recommends: (1) DRY WICKING — twist a clean cloth or ' +
        'paper into a wick, insert gently into the ear canal, leave for 1 minute then remove. Repeat at least three times a day ' +
        'until the ear is dry. (2) Topical ciprofloxacin 0.3 % ear drops, 5 drops twice daily for 2 weeks (or until no discharge ' +
        'for 3 consecutive days). Avoid aminoglycoside drops (ototoxic). Avoid plugging the ear with cotton wool / oil. (3) Oral ' +
        'antibiotics are NOT routinely recommended for CSOM; reserve for systemic features (fever, mastoid tenderness, intracranial ' +
        'concern). (4) Counsel safe-water practices — keep water out of the ear during bathing or swimming (custom-fit earplugs if ' +
        'persistent). (5) ENT referral if no response after 2 weeks of optimal wicking + drops, or if cholesteatoma is suspected ' +
        '(foul discharge, conductive hearing loss).',
      {},
      CODINGS_CSOM,
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
      label: 'WHO — IMCI Chart Booklet (2014)',
      url: 'https://www.who.int/publications/i/item/9789241506823',
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
          codings,
        },
      },
    };
  }
}
