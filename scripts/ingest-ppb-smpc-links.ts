#!/usr/bin/env ts-node
/**
 * Kenya PPB SmPC links — LINK-ONLY.
 *
 *   npm run labels:ppb-links                       # fetch the PPB SmPC index page once
 *   npm run labels:ppb-links -- --html saved.html  # offline, from a saved copy
 *
 * Fetches the single public index page https://web.pharmacyboardkenya.org/smpc/
 * (allowed by its robots.txt), matches PDF titles to VedaMD drugs, and writes
 * content/labels/ppb-smpc-links.json + ppb-smpc-report.md.
 *
 * It never downloads the PDFs and never stores SmPC text: registry source
 * `ppb-ke-smpc` is cite-only until PPB grants reuse
 * (docs/label-permission-requests/ppb-ke.md). The PPB product register is not
 * touched — its public export is restricted, so that data is requested, not scraped.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { DrugRecord } from '../src/modules/drugs/drugs.types';
import { matchSmpcLinks, parseSmpcIndex } from './lib/ppb';

const ROOT = resolve(__dirname, '..');
const INDEX_URL = 'https://web.pharmacyboardkenya.org/smpc/';
const USER_AGENT = 'VedaMD-label-ingest/0.1 (clinical decision support; link index only)';

async function main(): Promise<void> {
  const registry = JSON.parse(readFileSync(resolve(ROOT, 'content/sources/registry.json'), 'utf8'));
  const src = registry.sources.find((s: { id: string }) => s.id === 'ppb-ke-smpc');
  if (!src) {
    console.error('Registry source "ppb-ke-smpc" missing — refusing to run.');
    process.exit(2);
  }

  const htmlArg = process.argv.indexOf('--html');
  let html: string;
  if (htmlArg >= 0) {
    html = readFileSync(resolve(process.cwd(), process.argv[htmlArg + 1]), 'utf8');
  } else {
    const res = await fetch(INDEX_URL, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`PPB SmPC index HTTP ${res.status}`);
    html = await res.text();
  }

  const entries = parseSmpcIndex(html);
  if (entries.length < 100) {
    throw new Error(`Parsed only ${entries.length} SmPC entries — page layout may have changed.`);
  }
  const drugs = JSON.parse(
    readFileSync(resolve(ROOT, 'content/bundles/v0.1.0/drugs.json'), 'utf8'),
  ) as DrugRecord[];
  const links = matchSmpcLinks(drugs, entries);

  mkdirSync(resolve(ROOT, 'content/labels'), { recursive: true });
  writeFileSync(
    resolve(ROOT, 'content/labels/ppb-smpc-links.json'),
    JSON.stringify(links, null, 2) + '\n',
  );

  const linked = new Set(links.map((l) => l.slug));
  const keml = drugs.filter((d) => d.kemlLevel !== undefined);
  const kemlMissing = keml
    .filter((d) => !linked.has(d.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug));
  const matchedEntries = new Set(links.map((l) => l.url));
  const report = `# PPB SmPC link report

Generated ${new Date().toISOString()} from ${INDEX_URL}. Link-only — no SmPC
text stored (registry \`ppb-ke-smpc\`: ${src.embeddable}).

- SmPC documents in PPB index: ${entries.length}
- Documents linked to ≥1 VedaMD drug: ${matchedEntries.size}
- Drugs with ≥1 PPB SmPC link: ${linked.size} of ${drugs.length}
  - high confidence (trade name): ${new Set(links.filter((l) => l.confidence === 'high').map((l) => l.slug)).size}
  - medium confidence (INN in title only): ${new Set(links.filter((l) => l.confidence === 'medium').map((l) => l.slug)).size}
- KEML-listed drugs with no PPB SmPC found: ${kemlMissing.length} of ${keml.length}

Titles are free text chosen by applicants, so medium-confidence links need a
human spot check before they are shown to clinicians. Unmatched KEML drugs may
still be registered — the index has no INN column; confirm against the PPB
register once PPB supplies it.

## KEML drugs without a PPB SmPC link (${kemlMissing.length})

| slug | INN | KEML level |
|---|---|---|
${kemlMissing.map((d) => `| ${d.slug} | ${d.inn} | ${d.kemlLevel} |`).join('\n')}
`;
  writeFileSync(resolve(ROOT, 'content/labels/ppb-smpc-report.md'), report);
  console.log(
    `${entries.length} SmPCs in index · ${links.length} link(s) across ${linked.size} drug(s) → content/labels/ppb-smpc-links.json`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
