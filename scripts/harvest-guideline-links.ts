/* eslint-disable no-console */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Build a per-country index of national treatment guidelines — LINKS AND
 * METADATA ONLY.
 *
 * Every MoH source in content/sources/registry.json is tier 3,
 * `embeddable: cite-only`, `citationLicence: moh-restricted`, and
 * content/sources/README.md is explicit: cite and link, author original
 * logic from the underlying clinical facts, secure permission where logic
 * derives from national guidelines. So this harvester deliberately does NOT
 * fetch or store guideline text. It records what a document is and where it
 * lives, which is what the licence permits and what the platform actually
 * lacks: 2,899 citations in the bundle have no URL at all.
 *
 * It also hashes the PDF bytes without keeping them, so `content-freshness`
 * can tell when a ministry silently republishes an edition — a superseded
 * guideline cited for years is its own clinical risk.
 *
 * Usage:
 *   npm run guidelines:harvest -- --dry-run      # report, write nothing
 *   npm run guidelines:harvest -- --country KE   # one country
 *   npm run guidelines:harvest                   # all configured countries
 */

interface CountryEntry {
  cc: string;
  registrySource: string;
  entryPoints: string[];
}

interface GuidelineLink {
  cc: string;
  title: string;
  url: string;
  year?: number;
  publisher?: string;
  /** SHA-256 of the document bytes; the bytes themselves are discarded. */
  sha256?: string;
  bytes?: number;
  foundVia: string;
  lastSeen: string;
}

const ROOT = resolve(__dirname, '..');
const SOURCES = resolve(ROOT, 'content/guidelines/sources.json');
const OUT = resolve(ROOT, 'content/guidelines/links.json');
const REPORT = resolve(ROOT, 'content/guidelines/harvest-report.md');

const dryRun = process.argv.includes('--dry-run');
const onlyCc = (() => {
  const i = process.argv.indexOf('--country');
  return i === -1 ? undefined : process.argv[i + 1]?.toUpperCase();
})();

/** Documents worth indexing — a ministry publications page is mostly noise. */
const RELEVANT =
  /(guideline|protocol|standard treatment|formulary|essential (medicines|drugs)|\bEML\b|policy|manual|handbook)/i;

function absolute(href: string, base: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Pull PDF links and their anchor text out of a listing page. */
function extractPdfLinks(html: string, base: string): Array<{ url: string; title: string }> {
  const out: Array<{ url: string; title: string }> = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const href = m[1];
    if (!/\.pdf(\?|#|$)/i.test(href)) continue;
    const url = absolute(href, base);
    if (!url || seen.has(url)) continue;
    const title = m[2]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
    if (!title) continue;
    seen.add(url);
    out.push({ url, title });
  }
  return out;
}

function yearFrom(title: string, url: string): number | undefined {
  const m = `${title} ${url}`.match(/\b(19[89]\d|20[0-4]\d)\b/);
  if (!m) return undefined;
  const y = Number(m[1]);
  return y <= new Date().getFullYear() ? y : undefined;
}

/**
 * Hash a document without retaining it.
 *
 * A HEAD would be cheaper but ministry servers frequently do not give a
 * useful content-length or etag, and a hash is what actually detects a
 * silent republication under the same URL.
 */
async function hashDocument(url: string): Promise<{ sha256: string; bytes: number } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return { sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.byteLength };
  } catch {
    return null;
  }
}

async function main() {
  const cfg = JSON.parse(readFileSync(SOURCES, 'utf8')) as { countries: CountryEntry[] };
  const countries = cfg.countries.filter((c) => !onlyCc || c.cc === onlyCc);
  if (countries.length === 0) {
    console.error(`No country matching --country ${onlyCc}`);
    process.exit(1);
  }

  const links: GuidelineLink[] = [];
  const failures: Array<{ cc: string; entryPoint: string; reason: string }> = [];

  for (const country of countries) {
    for (const entryPoint of country.entryPoints) {
      try {
        const res = await fetch(entryPoint);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        const found = extractPdfLinks(html, entryPoint).filter(
          (l) => RELEVANT.test(l.title) || RELEVANT.test(l.url),
        );
        console.log(`✓ ${country.cc} ${entryPoint}: ${found.length} candidate document(s)`);
        for (const f of found) {
          const meta = dryRun ? null : await hashDocument(f.url);
          links.push({
            cc: country.cc,
            title: f.title,
            url: f.url,
            year: yearFrom(f.title, f.url),
            publisher: country.registrySource,
            ...(meta ?? {}),
            foundVia: entryPoint,
            lastSeen: new Date().toISOString(),
          });
        }
      } catch (err) {
        const reason = (err as Error).message;
        console.error(`✗ ${country.cc} ${entryPoint}: ${reason}`);
        failures.push({ cc: country.cc, entryPoint, reason });
      }
    }
  }

  const byCc = new Map<string, number>();
  for (const l of links) byCc.set(l.cc, (byCc.get(l.cc) ?? 0) + 1);

  let md = `# National guideline link index\n\n`;
  md += `Generated ${new Date().toISOString()} by \`npm run guidelines:harvest\`.\n\n`;
  md += `**Links and metadata only.** No guideline text is fetched or stored: every\n`;
  md += `MoH source is \`cite-only\` / \`moh-restricted\` in the registry. Document\n`;
  md += `hashes let content-freshness detect a silent republication; the bytes are\n`;
  md += `discarded.\n\n`;
  md += `| Country | Documents indexed |\n|---|---|\n`;
  for (const c of countries) md += `| ${c.cc} | ${byCc.get(c.cc) ?? 0} |\n`;
  if (failures.length) {
    md += `\n## Entry points that did not resolve\n\n`;
    md += `Ministry sites reorganise often; update \`content/guidelines/sources.json\`.\n\n`;
    md += `| Country | Entry point | Reason |\n|---|---|---|\n`;
    for (const f of failures) md += `| ${f.cc} | ${f.entryPoint} | ${f.reason} |\n`;
  }

  if (dryRun) {
    console.log(`\nDry run: ${links.length} document(s) would be indexed, ${failures.length} entry point(s) failed. Nothing written.`);
    return;
  }

  mkdirSync(resolve(ROOT, 'content/guidelines'), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), links }, null, 2) + '\n');
  writeFileSync(REPORT, md);
  console.log(`\nWrote ${links.length} link(s) to content/guidelines/links.json`);
  if (failures.length) {
    console.log(`${failures.length} entry point(s) failed — see harvest-report.md`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
