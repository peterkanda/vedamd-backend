/**
 * Coarse route-of-administration classes shared by label matching (openFDA
 * route codes, PPB SmPC titles) and VedaMD drug records (free-text dosing
 * routes). Coarse on purpose: the question is only "could this document be
 * about the same kind of product?", e.g. an eye drop vs a tablet.
 */
import type { DrugRecord } from '../../src/modules/drugs/drugs.types';

export type RouteClass =
  | 'oral'
  | 'injection'
  | 'inhaled'
  | 'nasal'
  | 'ophthalmic'
  | 'otic'
  | 'topical'
  | 'transdermal'
  | 'vaginal'
  | 'rectal'
  | 'irrigation';

/** Free-text route (VedaMD dosing rows) → classes. */
const TEXT_ROUTE: [RegExp, RouteClass][] = [
  [/ophthalm|\beye|intravitreal|conjunctiv/, 'ophthalmic'],
  [/\botic\b|\bear\b|auricular/, 'otic'],
  [/transdermal|patch/, 'transdermal'],
  [/topical|cutaneous|dermal|\bskin\b|scalp/, 'topical'],
  [
    /\biv\b|\bim\b|\bsc\b|\bsubcut|intraven|intramusc|subcutan|inject|infusion|intrathecal|epidural|intraosseous|\bio\b|intra-?articular|intradermal/,
    'injection',
  ],
  [/inhal|nebuli[sz]|\bmdi\b|\bdpi\b|respirat/, 'inhaled'],
  [/nasal|intranasal/, 'nasal'],
  [/vagin|\bpv\b|pessar/, 'vaginal'],
  [/rect|\bpr\b|suppositor|enema/, 'rectal'],
  [/irrigat/, 'irrigation'],
  [/oral|\bpo\b|sublingual|buccal|enteral|\bng\b|nasogastric|chew|by mouth/, 'oral'],
];

export function classifyRouteText(text: string): Set<RouteClass> {
  const t = text.toLowerCase();
  return new Set(TEXT_ROUTE.filter(([re]) => re.test(t)).map(([, c]) => c));
}

/** openFDA `openfda.route` values → class. Unlisted values are unclassified. */
const OPENFDA_ROUTE: Record<string, RouteClass> = {
  ORAL: 'oral',
  SUBLINGUAL: 'oral',
  BUCCAL: 'oral',
  ENTERAL: 'oral',
  INTRAVENOUS: 'injection',
  INTRAVASCULAR: 'injection',
  'INTRA-ARTERIAL': 'injection',
  INTRAMUSCULAR: 'injection',
  SUBCUTANEOUS: 'injection',
  INTRADERMAL: 'injection',
  INTRATHECAL: 'injection',
  EPIDURAL: 'injection',
  INTRAOSSEOUS: 'injection',
  'INTRA-ARTICULAR': 'injection',
  INTRACAVERNOUS: 'injection',
  INFILTRATION: 'injection',
  PERINEURAL: 'injection',
  'RESPIRATORY (INHALATION)': 'inhaled',
  NASAL: 'nasal',
  OPHTHALMIC: 'ophthalmic',
  INTRAVITREAL: 'ophthalmic',
  INTRAOCULAR: 'ophthalmic',
  INTRACAMERAL: 'ophthalmic',
  AURICULAR: 'otic',
  'AURICULAR (OTIC)': 'otic',
  TOPICAL: 'topical',
  CUTANEOUS: 'topical',
  TRANSDERMAL: 'transdermal',
  VAGINAL: 'vaginal',
  RECTAL: 'rectal',
  IRRIGATION: 'irrigation',
};

export function classifyOpenFdaRoutes(routes: string[]): Set<RouteClass> {
  return new Set(routes.map((r) => OPENFDA_ROUTE[r.toUpperCase()]).filter(Boolean));
}

/** Route classes a VedaMD drug record is dosed by (empty ⇒ unknown). */
export function drugRouteClasses(d: DrugRecord): Set<RouteClass> {
  const texts = [
    ...(d.dosing?.adult ?? []).map((a) => a.route),
    d.dosing?.paediatric?.route ?? '',
    d.slug.replace(/-/g, ' '),
  ];
  return classifyRouteText(texts.join(' | '));
}

/**
 * True unless both sides are classified and share no class. Unknown routes on
 * either side never exclude — only a positive mismatch does.
 */
export function routesCompatible(a: Set<RouteClass>, b: Set<RouteClass>): boolean {
  if (!a.size || !b.size) return true;
  return [...a].some((c) => b.has(c));
}
