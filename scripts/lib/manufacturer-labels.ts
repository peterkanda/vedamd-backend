/**
 * Pure helpers for scripts/ingest-manufacturer-labels.ts: INN parsing,
 * reference-label selection and section extraction. No network or disk I/O
 * here, so the matching rules are unit-testable (test/manufacturer-labels.spec.ts).
 */
import type {
  DrugRecord,
  LabelSection,
  LabelSectionKey,
  ManufacturerLabel,
} from '../../src/modules/drugs/drugs.types';
import aliasesFile from './inn-usan-aliases.json';
import { classifyOpenFdaRoutes, drugRouteClasses, routesCompatible } from './routes';

const ALIASES: Record<string, string> = aliasesFile.aliases;

/** Salt / ester words: "metoprolol tartrate / succinate" lists alternatives, not a combination. */
const SALT_WORDS = new Set([
  'acetate',
  'besylate',
  'bromide',
  'calcium',
  'citrate',
  'decanoate',
  'dihydrochloride',
  'dipropionate',
  'disodium',
  'fumarate',
  'gluconate',
  'hydrobromide',
  'hydrochloride',
  'lactate',
  'magnesium',
  'maleate',
  'mesylate',
  'monohydrate',
  'nitrate',
  'palmitate',
  'phosphate',
  'potassium',
  'propionate',
  'sodium',
  'succinate',
  'sulfate',
  'sulphate',
  'tartrate',
  'trihydrate',
]);

const DOSAGE_FORM_SUFFIX =
  /\s+(?:eye drops|ear drops|nasal spray|transdermal patch|subdermal implant|intrauterine system|vaginal ring|oral solution|eye ointment)$/;

/**
 * Split a VedaMD `inn` string into the ingredient names to look up. By default
 * INN/BAN names are mapped to US names for RxNorm/openFDA; pass
 * `usNames: false` to keep the INN (e.g. for Kenyan PPB documents).
 *
 *   "artemether + lumefantrine"            → ["artemether", "lumefantrine"]
 *   "Lopinavir/ritonavir"                  → ["lopinavir", "ritonavir"]
 *   "metoprolol tartrate / succinate"      → ["metoprolol tartrate"]
 *   "enoxaparin (low-molecular-weight heparin)" → ["enoxaparin"]
 *   "co-trimoxazole (PJP prophylaxis dose)"     → ["sulfamethoxazole", "trimethoprim"]
 *   "chloramphenicol 0.5 % eye drops"      → ["chloramphenicol"]
 */
export function parseInnComponents(inn: string, opts: { usNames?: boolean } = {}): string[] {
  const alias = (x: string) => (opts.usNames === false ? x : (ALIASES[x] ?? x));
  let s = inn.toLowerCase();
  // Strip (nested) parenthetical qualifiers.
  for (let prev = ''; prev !== s; ) {
    prev = s;
    s = s.replace(/\([^()]*\)/g, ' ');
  }
  s = s
    .replace(/\b\d+(\.\d+)?\s*%/g, ' ') // "0.9 %"
    .replace(/\s+/g, ' ')
    .trim()
    // A trailing dosage form names the product, not the ingredient:
    // "fentanyl transdermal patch" → "fentanyl".
    .replace(DOSAGE_FORM_SUFFIX, '')
    .trim();
  s = alias(s);

  let parts: string[];
  if (s.includes('+')) {
    parts = s.split('+');
  } else if (s.includes('/')) {
    const slash = s.split('/').map((p) => p.trim());
    const alternativesOnly = slash
      .slice(1)
      .every((p) => p.split(' ').every((w) => SALT_WORDS.has(w)));
    parts = alternativesOnly ? [slash[0]] : slash;
  } else {
    parts = [s];
  }
  return parts
    .map((p) => p.trim())
    .filter(Boolean)
    .map(alias)
    .flatMap((p) => (p.includes('+') ? p.split('+').map((q) => q.trim()) : [p]))
    .map((p) => p.replace(/\bsulphate\b/g, 'sulfate'));
}

// ─── openFDA label shape (only the fields we read) ────────────────────────

export interface OpenFdaLabel {
  set_id: string;
  id?: string;
  version?: string;
  effective_time: string;
  openfda: {
    application_number?: string[];
    brand_name?: string[];
    generic_name?: string[];
    manufacturer_name?: string[];
    product_type?: string[];
    route?: string[];
    substance_name?: string[];
    rxcui?: string[];
  };
  [section: string]: unknown;
}

export type ApplicationType = ManufacturerLabel['applicationType'];

export function classifyApplication(numbers: string[] | undefined): ApplicationType {
  const n = numbers ?? [];
  if (n.some((x) => x.startsWith('BLA'))) return 'BLA';
  if (n.some((x) => x.startsWith('NDA'))) return 'NDA';
  if (n.some((x) => x.startsWith('ANDA'))) return 'ANDA';
  return 'other';
}

const APP_RANK: Record<ApplicationType, number> = { BLA: 0, NDA: 0, ANDA: 1, other: 2 };

export interface SelectedLabel {
  primary: OpenFdaLabel;
  alternates: OpenFdaLabel[];
}

/**
 * Pick one reference label per route.
 *
 *   - Drops labels whose active-substance count differs from the drug's
 *     ingredient count (a single-ingredient drug never matches a combination
 *     label and vice versa).
 *   - Within a route: innovator (NDA/BLA) before generic (ANDA) before
 *     other (OTC monograph / unapproved), then most recent effective_time.
 *   - Up to `maxAlternates` other labels for that route are kept as links.
 *
 * Repackager labels are excluded upstream by the openFDA query
 * (`_missing_:openfda.original_packager_product_ndc`).
 */
export function selectReferenceLabels(
  candidates: OpenFdaLabel[],
  ingredientCount: number,
  maxAlternates = 3,
): SelectedLabel[] {
  const bySet = new Map<string, OpenFdaLabel>();
  for (const c of candidates) {
    if ((c.openfda.substance_name ?? []).length !== ingredientCount) continue;
    const prev = bySet.get(c.set_id);
    if (!prev || c.effective_time > prev.effective_time) bySet.set(c.set_id, c);
  }
  const byRoute = new Map<string, OpenFdaLabel[]>();
  for (const c of bySet.values()) {
    const key = [...(c.openfda.route ?? ['UNKNOWN'])].sort().join('+');
    byRoute.set(key, [...(byRoute.get(key) ?? []), c]);
  }
  const out: SelectedLabel[] = [];
  for (const key of [...byRoute.keys()].sort()) {
    const ranked = byRoute
      .get(key)!
      .sort(
        (a, b) =>
          APP_RANK[classifyApplication(a.openfda.application_number)] -
            APP_RANK[classifyApplication(b.openfda.application_number)] ||
          b.effective_time.localeCompare(a.effective_time) ||
          a.set_id.localeCompare(b.set_id),
      );
    out.push({ primary: ranked[0], alternates: ranked.slice(1, 1 + maxAlternates) });
  }
  return out;
}

// ─── Section extraction ────────────────────────────────────────────────────

/** openFDA field(s) per section, first non-empty wins. PLR Rx labels, older
 *  non-PLR Rx labels and OTC Drug Facts name sections differently. */
const SECTION_FIELDS: Record<LabelSectionKey, string[]> = {
  boxedWarning: ['boxed_warning'],
  indications: ['indications_and_usage', 'purpose'],
  dosageAndAdministration: ['dosage_and_administration'],
  dosageFormsAndStrengths: ['dosage_forms_and_strengths'],
  contraindications: ['contraindications'],
  warningsAndPrecautions: ['warnings_and_cautions', 'warnings', 'precautions'],
  drugInteractions: ['drug_interactions'],
  pregnancy: ['pregnancy', 'pregnancy_or_breast_feeding'],
  lactation: ['lactation', 'nursing_mothers'],
  pediatricUse: ['pediatric_use'],
  geriatricUse: ['geriatric_use'],
  overdosage: ['overdosage'],
  doNotUse: ['do_not_use'],
  askDoctor: ['ask_doctor'],
  stopUse: ['stop_use'],
};

/** Every openFDA field any section may read. */
export const LABEL_SOURCE_FIELDS: string[] = [...new Set(Object.values(SECTION_FIELDS).flat())];

export const DEFAULT_SECTION_CAP = 4000;

export function cleanLabelText(value: unknown): string {
  const parts = Array.isArray(value) ? value : [value];
  return parts
    .filter((p): p is string => typeof p === 'string')
    .map((p) =>
      p
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/[ \t ]+/g, ' ')
        .replace(/\s*\n\s*/g, '\n')
        .trim(),
    )
    .filter(Boolean)
    .join('\n\n');
}

/** Cut at the last sentence or word boundary before `cap` characters. */
export function truncateAt(text: string, cap: number): LabelSection {
  if (text.length <= cap) return { text, truncated: false };
  const slice = text.slice(0, cap);
  const sentence = slice.lastIndexOf('. ');
  const cut = sentence > cap * 0.6 ? sentence + 1 : Math.max(slice.lastIndexOf(' '), 1);
  return { text: slice.slice(0, cut).trimEnd() + ' …', truncated: true };
}

export function extractSections(
  label: OpenFdaLabel,
  cap = DEFAULT_SECTION_CAP,
): ManufacturerLabel['sections'] {
  const out: ManufacturerLabel['sections'] = {};
  for (const [key, fields] of Object.entries(SECTION_FIELDS) as [LabelSectionKey, string[]][]) {
    for (const f of fields) {
      const text = cleanLabelText(label[f]);
      if (text) {
        out[key] = truncateAt(text, cap);
        break;
      }
    }
  }
  return out;
}

// ─── Record assembly ───────────────────────────────────────────────────────

export interface CountryProfiles {
  profiles: Record<string, { nationalFormularySource?: string }>;
}

export function formularyFor(
  drug: DrugRecord,
  profiles: CountryProfiles,
): ManufacturerLabel['formulary'] {
  const national = [{ country: 'KE', sourceId: 'moh-ke' }];
  for (const [country, p] of Object.entries(profiles.profiles).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (p.nationalFormularySource) national.push({ country, sourceId: p.nationalFormularySource });
  }
  return {
    atc: drug.atc ?? [],
    ...(drug.kemlLevel !== undefined ? { kemlLevel: drug.kemlLevel } : {}),
    ...(drug.whoEml !== undefined ? { whoEml: drug.whoEml } : {}),
    ...(drug.awareCategory ? { awareCategory: drug.awareCategory } : {}),
    nationalFormularySources: national,
  };
}

/** "20260908" → "2026-09-08". */
export function isoDate(effectiveTime: string): string {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(effectiveTime);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : effectiveTime;
}

export function dailyMedUrl(setId: string): string {
  return `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(setId)}`;
}

export function buildLabelRecord(args: {
  drug: DrugRecord;
  rxcuiIngredients: string[];
  selected: SelectedLabel;
  profiles: CountryProfiles;
  retrievedAt: string;
  sectionCap?: number;
}): ManufacturerLabel {
  const { drug, selected } = args;
  const p = selected.primary;
  const o = p.openfda;
  const manufacturer = o.manufacturer_name?.[0] ?? 'Unknown manufacturer';
  const brand = o.brand_name?.[0];
  const effectiveDate = isoDate(p.effective_time);
  return {
    slug: drug.slug,
    inn: drug.inn,
    rxcuiIngredients: args.rxcuiIngredients,
    jurisdiction: 'US',
    source: 'openfda',
    setId: p.set_id,
    splVersion: String(p.version ?? ''),
    effectiveDate,
    manufacturer,
    brandNames: o.brand_name ?? [],
    applicationNumbers: o.application_number ?? [],
    applicationType: classifyApplication(o.application_number),
    productType: o.product_type?.[0] ?? '',
    routes: o.route ?? [],
    sections: extractSections(p, args.sectionCap),
    alternateSetIds: selected.alternates.map((a) => a.set_id),
    formulary: formularyFor(drug, args.profiles),
    citation: {
      label: `${brand ?? drug.inn} — US product label (${manufacturer}, ${effectiveDate}), DailyMed`,
      url: dailyMedUrl(p.set_id),
      accessedDate: args.retrievedAt.slice(0, 10),
      identifier: `spl-set-id:${p.set_id}`,
      strength: 'A',
      sourceType: 'drug-label',
      licence: 'public-domain',
    },
    retrievedAt: args.retrievedAt,
    reviewStatus: 'draft',
  };
}

/**
 * Drop labels whose route cannot be the drug record's product — e.g. an
 * injection label on `glycopyrronium-inhaled`, or an irrigation solution on
 * hypertonic saline for nebulisation. A label with no route never excludes;
 * one with only unrecognised routes is excluded when the drug's route is known.
 */
export function filterLabelsByRoute(
  drug: DrugRecord,
  labels: ManufacturerLabel[],
): ManufacturerLabel[] {
  const wanted = drugRouteClasses(drug);
  return labels.filter((l) => {
    const have = classifyOpenFdaRoutes(l.routes);
    // A label whose routes are all unrecognised (e.g. EXTRACORPOREAL) is not
    // evidence of a match when the drug's own route is known.
    if (wanted.size && l.routes.length && !have.size) return false;
    return routesCompatible(wanted, have);
  });
}

/**
 * When the drug's INN names a concentration ("sodium chloride 3%"), keep only
 * labels that mention that concentration — otherwise a 0.9 % label would sit
 * beside hypertonic saline.
 */
export function filterLabelsByConcentration(
  drug: DrugRecord,
  labels: ManufacturerLabel[],
): ManufacturerLabel[] {
  const pct = /(\d+(?:\.\d+)?)\s*%/.exec(drug.inn)?.[1];
  if (!pct) return labels;
  const re = new RegExp(`(^|[^\\d.])${pct.replace('.', '\\.')}\\s*%`);
  return labels.filter((l) =>
    [...l.brandNames, ...Object.values(l.sections).map((x) => x?.text ?? '')].some((t) =>
      re.test(t),
    ),
  );
}
