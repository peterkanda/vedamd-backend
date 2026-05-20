import { Injectable } from '@nestjs/common';
import type { CdsRule } from '../../conditions/conditions.types';
import type { CdsCard, CdsHookRequest, CdsIndicator, CodedReference } from '../cds.types';
import { resolveCardCopy } from '../locale';
import type { CdsRuleStrategy } from './types';

/**
 * Tuberculosis treatment regimens — WHO Consolidated Guidelines on
 * Tuberculosis (Module 4, 2022 + 2024 update) + Kenya National TB
 * Programme treatment protocol.
 *
 * Anonymous-by-design context (the screen rule is a separate
 * strategy — this rule is invoked once the diagnosis is confirmed
 * and the integrator wants the WHO regimen + duration + monitoring):
 *
 *   tbConfirmed                  boolean (sentinel — diagnosis confirmed)
 *   ageYears                     number
 *   weightKg                     number (for weight-banded dosing)
 *   tbCategory                   'pulmonary-ds' | 'extrapulmonary-ds'
 *                                | 'rifampicin-resistant' | 'mdr'
 *                                | 'xdr' | 'pre-xdr' | null
 *   priorTbTreatment             boolean (relapse / re-treatment)
 *   hivStatus                    'positive' | 'negative' | 'unknown' | null
 *   pregnant                     boolean
 *   liverDiseaseModerateOrSevere boolean
 *   diabetesPresent              boolean
 *   xpertResult                  'mtb-pos' | 'mtb-pos-rif-res' | 'mtb-neg' | null
 *   firstLineDrugSusceptibility  'ds' | 'rif-res' | 'mdr' | 'pre-xdr' | 'xdr' | null
 */

interface TbContext {
  tbConfirmed?: boolean;
  ageYears?: number;
  weightKg?: number;
  tbCategory?: 'pulmonary-ds' | 'extrapulmonary-ds' | 'rifampicin-resistant' | 'mdr' | 'xdr' | 'pre-xdr' | null;
  priorTbTreatment?: boolean;
  hivStatus?: 'positive' | 'negative' | 'unknown' | null;
  pregnant?: boolean;
  liverDiseaseModerateOrSevere?: boolean;
  diabetesPresent?: boolean;
  xpertResult?: 'mtb-pos' | 'mtb-pos-rif-res' | 'mtb-neg' | null;
  firstLineDrugSusceptibility?: 'ds' | 'rif-res' | 'mdr' | 'pre-xdr' | 'xdr' | null;
}

const CODINGS_DS_TB: CodedReference[] = [
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'A15', display: 'Pulmonary tuberculosis', kind: 'diagnosis' },
  { system: 'http://hl7.org/fhir/sid/icd-10', code: 'A16', display: 'Tuberculosis of other organs', kind: 'diagnosis' },
  { system: 'http://id.who.int/icd/release/11/mms', code: '1B10', display: 'Tuberculosis (active)', kind: 'diagnosis' },
  { system: 'http://snomed.info/sct', code: '56717001', display: 'Tuberculosis (disorder)', kind: 'diagnosis' },
  { system: 'http://whocc.no/atc', code: 'J04AM06', display: 'Rifampicin + isoniazid + pyrazinamide + ethambutol (HRZE)', kind: 'drug' },
  { system: 'http://whocc.no/atc', code: 'J04AC01', display: 'Isoniazid', kind: 'drug' },
  { system: 'http://whocc.no/atc', code: 'J04AB02', display: 'Rifampicin', kind: 'drug' },
  { system: 'http://whocc.no/atc', code: 'J04AK01', display: 'Pyrazinamide', kind: 'drug' },
  { system: 'http://whocc.no/atc', code: 'J04AK02', display: 'Ethambutol', kind: 'drug' },
];

const CODINGS_DR_TB: CodedReference[] = [
  { system: 'http://id.who.int/icd/release/11/mms', code: '1B14', display: 'Drug-resistant tuberculosis', kind: 'diagnosis' },
  { system: 'http://snomed.info/sct', code: '85729005', display: 'Drug-resistant tuberculosis (disorder)', kind: 'diagnosis' },
  { system: 'http://whocc.no/atc', code: 'J04AK05', display: 'Bedaquiline', kind: 'drug' },
  { system: 'http://whocc.no/atc', code: 'J04AK08', display: 'Pretomanid', kind: 'drug' },
  { system: 'http://whocc.no/atc', code: 'N03AX14', display: 'Levetiracetam — not used in TB (placeholder)', kind: 'drug' },
];

function hrzeWeightBand(wt?: number): string {
  if (typeof wt !== 'number') return 'Use the WHO weight-banded fixed-dose combination tables (HRZE 4FDC) per local NTP chart.';
  if (wt < 25) return `Weight ${wt} kg — use paediatric child-friendly dispersible RHZ 75/50/150 + E 100 tablets per WHO/Kenya NTP weight bands.`;
  if (wt < 38) return `Weight ${wt} kg (25–37 kg band) — HRZE 4FDC ×2 tablets daily (R150 H75 Z400 E275).`;
  if (wt < 55) return `Weight ${wt} kg (38–54 kg band) — HRZE 4FDC ×3 tablets daily.`;
  if (wt < 71) return `Weight ${wt} kg (55–70 kg band) — HRZE 4FDC ×4 tablets daily.`;
  return `Weight ${wt} kg (≥ 71 kg band) — HRZE 4FDC ×5 tablets daily.`;
}

@Injectable()
export class TbTreatmentStrategy implements CdsRuleStrategy {
  readonly type = 'tb-treatment';

  async evaluate(rule: CdsRule, req: CdsHookRequest): Promise<CdsCard[]> {
    const ctx = (req.context ?? {}) as TbContext;
    if (ctx.tbConfirmed !== true) return [];

    const category = ctx.tbCategory ?? this.inferCategory(ctx);
    if (!category) {
      return [
        this.buildCard(
          rule,
          req,
          'warning',
          'TB diagnosed — confirm category before initiating treatment',
          'No category provided and unable to infer. Confirm Xpert MTB/RIF Ultra result, drug-susceptibility testing (DST) where ' +
            'available, treatment history (new vs relapse vs treatment-after-loss-to-follow-up), site (pulmonary vs extra-pulmonary), ' +
            'HIV status, pregnancy, and weight before starting therapy. Notify the District TB / Leprosy Coordinator within 24 h ' +
            '(case notification is mandatory).',
          {},
          CODINGS_DS_TB,
        ),
      ];
    }

    if (category === 'pulmonary-ds' || category === 'extrapulmonary-ds') {
      return [this.dsTbCard(rule, req, ctx, category)];
    }
    if (category === 'rifampicin-resistant' || category === 'mdr') {
      return [this.mdrTbCard(rule, req, ctx)];
    }
    if (category === 'pre-xdr' || category === 'xdr') {
      return [this.preXdrCard(rule, req)];
    }
    return [];
  }

  private inferCategory(ctx: TbContext): TbContext['tbCategory'] | null {
    if (ctx.xpertResult === 'mtb-pos-rif-res' || ctx.firstLineDrugSusceptibility === 'rif-res') {
      return 'rifampicin-resistant';
    }
    if (ctx.firstLineDrugSusceptibility === 'mdr') return 'mdr';
    if (ctx.firstLineDrugSusceptibility === 'pre-xdr') return 'pre-xdr';
    if (ctx.firstLineDrugSusceptibility === 'xdr') return 'xdr';
    if (ctx.xpertResult === 'mtb-pos' || ctx.firstLineDrugSusceptibility === 'ds') {
      return 'pulmonary-ds';
    }
    return null;
  }

  private dsTbCard(rule: CdsRule, req: CdsHookRequest, ctx: TbContext, category: 'pulmonary-ds' | 'extrapulmonary-ds'): CdsCard {
    const band = hrzeWeightBand(ctx.weightKg);
    const durationLine =
      category === 'extrapulmonary-ds'
        ? 'Standard 6-month regimen 2HRZE / 4HR. Extend to 9–12 months for CNS, bone / joint, and disseminated TB. Add adjunctive corticosteroids (prednisolone 1–2 mg/kg/day tapered over 6–8 weeks) for TB meningitis and TB pericarditis.'
        : 'Standard 6-month regimen 2HRZE / 4HR. Alternative WHO 4-month rifapentine + moxifloxacin regimen (2HPMZ / 2HPM) may be used in patients ≥ 12 y, ≥ 40 kg, pulmonary DS-TB with no HIV-related contraindications (Module 4 2022 update).';
    const hivLine =
      ctx.hivStatus === 'positive'
        ? ' HIV co-infection: start ART within 2 weeks of TB treatment in CD4 < 50 and within 8 weeks otherwise (within 2 weeks for TB meningitis). Use TLD; rifampicin doubles dolutegravir clearance — give dolutegravir 50 mg twice daily during rifampicin + 2 weeks after.'
        : ctx.hivStatus === 'unknown'
          ? ' HIV status unknown — offer PITC today (mandatory in all TB patients per WHO HTS and Kenya NASCOP).'
          : '';
    const pregLine =
      ctx.pregnant === true
        ? ' Pregnancy: HRZE is the standard regimen and safe in pregnancy and breastfeeding. Add pyridoxine 50 mg daily to prevent isoniazid-induced neuropathy.'
        : ' Add pyridoxine 25 mg daily (50 mg in HIV / diabetes / alcohol-use / pregnancy / breastfeeding) to prevent isoniazid neuropathy.';
    const hepatoLine =
      ctx.liverDiseaseModerateOrSevere === true
        ? ' Moderate / severe liver disease: refer for specialist regimen — consider a reduced-hepatotoxicity regimen (e.g. R + E + streptomycin + a fluoroquinolone) and increase liver-function monitoring to weekly.'
        : '';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Drug-susceptible TB — start 6-month regimen 2HRZE / 4HR',
      'Drug-susceptible TB confirmed ({{cat}}). {{band}} {{duration}} Direct observation (DOT) or video-observed treatment is ' +
        'preferred per WHO/NTP. Baseline tests: LFTs (ALT, AST, total bilirubin), creatinine, HIV (if unknown), pregnancy test (history ' +
        'only — not on platform), visual acuity + colour vision (for ethambutol), random glucose (TB-diabetes screening), HBsAg, ' +
        'anti-HCV. Repeat LFTs at 2, 4 and 8 weeks; stop drug if ALT > 3× ULN with symptoms OR > 5× ULN without. Monthly sputum AFB ' +
        'and Xpert MTB/RIF at month 2 and month 5 to confirm conversion.{{hiv}}{{preg}}{{hepato}} Notify the District TB Coordinator ' +
        'within 24 h; contact-trace household members and offer TB-preventive therapy to eligible contacts (children < 5, PLHIV) and ' +
        'BCG vaccination check.',
      { cat: category, band, duration: durationLine, hiv: hivLine, preg: pregLine, hepato: hepatoLine },
      CODINGS_DS_TB,
    );
  }

  private mdrTbCard(rule: CdsRule, req: CdsHookRequest, ctx: TbContext): CdsCard {
    const ageNote =
      typeof ctx.ageYears === 'number' && ctx.ageYears < 18
        ? ' Paediatric MDR-TB: defer to specialist; BPaL is not yet licensed for children < 14 y in most settings. Use individualised longer regimen with bedaquiline, levofloxacin, linezolid, clofazimine + companion drugs guided by DST and weight.'
        : '';
    return this.buildCard(
      rule,
      req,
      'critical',
      'Rifampicin-resistant / MDR-TB — refer urgently to PMDT site for BPaL(M) or longer regimen',
      'Rifampicin-resistant TB cannot be treated with the first-line regimen. Per WHO 2022 + 2024 update, the preferred regimen is ' +
        'the all-oral 6-month BPaL(M): bedaquiline 400 mg daily × 2 weeks then 200 mg three times weekly; pretomanid 200 mg daily; ' +
        'linezolid 600 mg daily (or 300 mg if neuropathy / cytopenia); add moxifloxacin 400 mg daily UNLESS fluoroquinolone resistance ' +
        'is confirmed (then becomes BPaL). Refer to the nearest Programmatic Management of Drug-Resistant TB (PMDT) site within 48 h ' +
        '— Kenya NTLD-P now uses BPaL(M) as the default. If BPaL(M) cannot be used (pregnancy, age < 14, fluoroquinolone resistance ' +
        'unconfirmed, severe extrapulmonary disease), use the WHO longer all-oral 18–20-month regimen with bedaquiline, levofloxacin, ' +
        'linezolid, clofazimine, cycloserine ± delamanid. Monitor monthly: LFTs, full blood count (linezolid myelosuppression), ECG ' +
        'QTc (bedaquiline + moxifloxacin), visual acuity + colour vision (linezolid optic neuritis), audiology (for second-line ' +
        'injectables if used).{{age}} Notify within 24 h; contact-trace and offer susceptibility-guided TPT to household contacts.',
      { age: ageNote },
      CODINGS_DR_TB,
    );
  }

  private preXdrCard(rule: CdsRule, req: CdsHookRequest): CdsCard {
    return this.buildCard(
      rule,
      req,
      'critical',
      'Pre-XDR / XDR-TB — individualised regimen at a specialist centre',
      'Pre-XDR (resistance to rifampicin + any fluoroquinolone) or XDR (additional resistance to bedaquiline or linezolid). Refer to ' +
        'a national reference centre for an individualised regimen guided by full DST. WHO recommends a regimen of at least four ' +
        'effective agents (bedaquiline, linezolid, clofazimine, cycloserine or other Group B/C drugs, plus pretomanid or delamanid) ' +
        'for 18–20 months. Discuss with the national TB programme. Side-effect monitoring is intensive: monthly LFTs, full blood ' +
        'count, ECG, visual acuity / colour vision, audiology. Mortality is high — early surgical consult for cavitary disease may ' +
        'be appropriate.',
      {},
      CODINGS_DR_TB,
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
      label: 'WHO Consolidated Guidelines on Tuberculosis — Module 4: Treatment (2022 + 2024 update)',
      url: 'https://www.who.int/publications/i/item/9789240063129',
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
