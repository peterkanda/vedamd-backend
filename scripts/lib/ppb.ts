/**
 * Kenya Pharmacy and Poisons Board (PPB) parsers and matchers.
 *
 * Licensing (registry `ppb-ke-smpc`, `ppb-ke-register`, both cite-only):
 *   - SmPC index: we store LINKS only (title + PDF URL). No SmPC text.
 *   - Product register: PPB restricts the public CSV export, so we do not
 *     page-scrape it. `parseRegisterPage` exists for when PPB supplies the data
 *     or grants access; the caller must check the registry verdict first.
 */
import type { DrugRecord, PpbSmpcLink } from '../../src/modules/drugs/drugs.types';
import { parseInnComponents } from './manufacturer-labels';
import { drugRouteClasses, routesCompatible, type RouteClass } from './routes';

const decode = (s: string) =>
  s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function rows(html: string): string[][] {
  const out: string[][] = [];
  for (const tr of html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = [...tr.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1]);
    if (cells.length) out.push(cells);
  }
  return out;
}

// ─── SmPC index (web.pharmacyboardkenya.org/smpc/) ─────────────────────────

export interface SmpcIndexEntry {
  title: string;
  url: string;
}

/** Rows are: ID · display name · filename · link to products.pharmacyboardkenya.org/uploads/*.pdf */
export function parseSmpcIndex(html: string): SmpcIndexEntry[] {
  const seen = new Set<string>();
  const out: SmpcIndexEntry[] = [];
  for (const cells of rows(html)) {
    const href = cells
      .map(
        (c) =>
          /href="(https:\/\/products\.pharmacyboardkenya\.org\/uploads\/[^"]+\.pdf)"/i.exec(c)?.[1],
      )
      .find(Boolean);
    if (!href || seen.has(href)) continue;
    seen.add(href);
    const title = decode(cells[1] ?? '') || decode(cells[2] ?? '').replace(/\.pdf$/i, '');
    out.push({ title, url: href });
  }
  return out;
}

/** Lower-case word string: underscores/punctuation → spaces, "sulphate" → "sulfate". */
export function normaliseTitle(s: string): string {
  return ` ${s
    .toLowerCase()
    .replace(/%20/g, ' ')
    .replace(/[_\-/+(),.]/g, ' ')
    .replace(/\bsulphate\b/g, 'sulfate')
    .replace(/\s+/g, ' ')
    .trim()} `;
}

const hasWords = (haystack: string, phrase: string) => haystack.includes(` ${phrase} `);

/** "clavulanic acid" also appears as "clavulanate" in product titles. */
function variants(component: string): string[] {
  const m = /^(\w+)ic acid$/.exec(component);
  return m ? [component, `${m[1]}ate`] : [component];
}

const TITLE_ROUTE: [RegExp, RouteClass][] = [
  [/\b(eye|ophthalmic)\b/, 'ophthalmic'],
  [/\b(ear|otic)\b/, 'otic'],
  [/\b(patch|transdermal)\b/, 'transdermal'],
  [/\b(cream|ointment|gel|lotion|topical|dermal|shampoo)\b/, 'topical'],
  [/\b(injection|infusion|injectable|vial|ampoule|syringe|iv|im)\b/, 'injection'],
  [/\b(inhaler|inhalation|nebuli[sz]er|respirator solution)\b/, 'inhaled'],
  [/\b(nasal)\b/, 'nasal'],
  [/\b(pessary|pessaries|vaginal)\b/, 'vaginal'],
  [/\b(suppository|suppositories|rectal)\b/, 'rectal'],
  [/\b(tablet|tablets|capsule|capsules|syrup|suspension|oral|sachet|granules)\b/, 'oral'],
];

function titleRoutes(t: string): Set<RouteClass> {
  // An oral-looking word inside an injectable title ("powder for suspension for
  // injection") must not add 'oral', so the first (most specific) class wins.
  const hit = TITLE_ROUTE.find(([re]) => re.test(t));
  return new Set(hit ? [hit[1]] : []);
}

/** "X & Y", "X and Y", "X + Y", "X/Y", or a brand line extension ("Panadol
 *  Extra", "Cold & Flu") — likely a combination product, so never linked to a
 *  single-ingredient drug. Over-excludes on purpose: a missed link is safe, a
 *  wrong one is not. */
const COMBINATION =
  /\s(&|and|\+|with)\s|\w\/\w|\b(extra|plus|cold|flu|sinus|duo|compound|combi|forte|night|max|co)\b/;

/**
 * Match SmPC index entries to drug records.
 *
 *   high   — title starts with one of the drug's trade names (≥4 chars)
 *   medium — title contains every INN component of the drug and does not name
 *            a route the drug's dosing never uses
 *
 * Every candidate is excluded when the title names another catalogue drug's
 * ingredient, or — for a single-ingredient drug — looks like a combination.
 */
export function matchSmpcLinks(drugs: DrugRecord[], entries: SmpcIndexEntry[]): PpbSmpcLink[] {
  const components = new Map(
    drugs.map((d) => [
      d.slug,
      parseInnComponents(d.inn, { usNames: false }).map((c) => normaliseTitle(c).trim()),
    ]),
  );
  const routes = new Map(drugs.map((d) => [d.slug, drugRouteClasses(d)]));
  // Every INN component word-phrase known to the catalogue (plus -ate forms).
  const allComponents = [...new Set([...components.values()].flat().flatMap(variants))].filter(
    (c) => c.length >= 4,
  );

  const out: PpbSmpcLink[] = [];
  for (const e of entries) {
    const t = normaliseTitle(e.title);
    const rawTitle = ` ${e.title.toLowerCase().replace(/_/g, ' ')} `;
    const named = allComponents.filter((c) => hasWords(t, c));
    const tRoutes = titleRoutes(t);
    for (const d of drugs) {
      const own = components.get(d.slug)!;
      const ownVariants = own.flatMap(variants);
      const namesOther = named.some(
        (c) => !ownVariants.some((o) => o === c || o.includes(c) || c.includes(o)),
      );
      if (namesOther) continue;
      const single = own.length === 1;
      if (single && COMBINATION.test(rawTitle)) continue;
      const brand = d.tradeNames.find(
        (n) => n.length >= 4 && t.startsWith(normaliseTitle(n).trimEnd() + ' '),
      );
      if (brand) {
        out.push({
          slug: d.slug,
          title: e.title,
          url: e.url,
          matchedOn: 'trade-name',
          confidence: 'high',
        });
        continue;
      }
      if (
        !own.length ||
        !own.every((c) => c.length >= 4 && variants(c).some((v) => named.includes(v)))
      ) {
        continue;
      }
      if (!routesCompatible(tRoutes, routes.get(d.slug)!)) continue;
      out.push({
        slug: d.slug,
        title: e.title,
        url: e.url,
        matchedOn: 'inn',
        confidence: 'medium',
      });
    }
  }
  return out.sort((a, b) => a.slug.localeCompare(b.slug) || a.title.localeCompare(b.title));
}

// ─── Product register (xcrud table) — only used once PPB grants access ──────

export interface PpbRegisteredProduct {
  registrationNo: string;
  tradeName: string;
  inn: string;
  dosageForm: string;
  countryOfOrigin: string;
  localForeign: string;
  mah: string;
  localTechnicalRepresentative: string;
  registrationDate: string;
  expiryDate: string;
}

const HEADER_FIELDS: Record<string, keyof PpbRegisteredProduct> = {
  'product registration no': 'registrationNo',
  'product trade name': 'tradeName',
  'inn of api': 'inn',
  'dosage form name': 'dosageForm',
  'country of origin': 'countryOfOrigin',
  'local foreign': 'localForeign',
  'mah company name': 'mah',
  'local technical representative': 'localTechnicalRepresentative',
  'date of registration': 'registrationDate',
  'date of expiry': 'expiryDate',
};

/** "2026 September 02" → "2026-09-02" (unparseable values are returned as-is). */
export function ppbDate(s: string): string {
  const m = /^(\d{4}) ([A-Za-z]+) (\d{1,2})$/.exec(s.trim());
  if (!m) return s.trim();
  const month = new Date(`${m[2]} 1, 2000`).getMonth() + 1;
  return Number.isNaN(month)
    ? s.trim()
    : `${m[1]}-${String(month).padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

/** Parse one page of the PPB register. Columns are mapped by header text, so a
 *  column reorder on PPB's side cannot silently shift fields. */
export function parseRegisterPage(html: string): PpbRegisteredProduct[] {
  const table = /<table[^>]*xcrud-list[\s\S]*?<\/table>/i.exec(html)?.[0];
  if (!table) return [];
  const all = rows(table);
  const header = all.find((r) => r.some((c) => /Product Registration No/i.test(c)));
  if (!header) return [];
  const map = header.map((h) => HEADER_FIELDS[decode(h).toLowerCase()]);
  if (!map.includes('registrationNo') || !map.includes('inn')) return [];
  return all
    .filter((r) => r !== header && r.length === header.length)
    .map((r) => {
      const rec = {} as PpbRegisteredProduct;
      r.forEach((cell, i) => {
        const key = map[i];
        if (key) rec[key] = decode(cell);
      });
      rec.registrationDate = ppbDate(rec.registrationDate ?? '');
      rec.expiryDate = ppbDate(rec.expiryDate ?? '');
      return rec;
    })
    .filter((r) => r.registrationNo);
}
