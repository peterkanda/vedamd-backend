#!/usr/bin/env ts-node
/**
 * Parity matrix generator.
 *
 *   npm run parity:matrix
 *
 * Goal: 9 anglophone countries supported to the same level as Kenya. This
 * makes progress toward that goal visible by writing content/overlays/PARITY.md
 * from the real state on disk:
 *
 *   - Kenya parity target  = the domains in the signed bundle (content/bundles).
 *   - WHO baseline layer    = content/overlays/_base/*.json (inherited by ALL
 *                             countries as draft until promoted/overridden).
 *   - National overlays     = content/overlays/<CC>/records/*.json.
 *
 * The fastest safe route to parity is a complete WHO baseline (universal
 * clinical content authored once, inherited by every country) plus national
 * overlays only for genuinely divergent topics (EML drug choices, immunization
 * schedules, national HIV/TB/malaria protocols).
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const BUNDLE = resolve(ROOT, 'content/bundles/v0.1.0');
const OVERLAYS = resolve(ROOT, 'content/overlays');

/** Kenya parity target: signed-bundle content domains (file stems). */
function kenyaDomains(): string[] {
  return readdirSync(BUNDLE)
    .filter((f) => f.endsWith('.json') && f !== 'manifest.json')
    .map((f) => f.replace(/\.json$/, ''))
    .sort();
}

type DomainClass = 'universal' | 'national-divergent' | 'mixed';

/** How each Kenya domain reaches parity (content/overlays/domain-classification.json). */
function domainClassification(): Record<string, DomainClass> {
  const file = resolve(OVERLAYS, 'domain-classification.json');
  if (!existsSync(file)) return {};
  return (JSON.parse(readFileSync(file, 'utf8')).domains ?? {}) as Record<string, DomainClass>;
}

interface BaseRecord {
  slug?: string;
  domain?: string;
  reviewStatus?: string;
}

/** WHO baseline domains from _base/*.json → { domain: recordCount }. */
function baselineDomains(): Map<string, number> {
  const out = new Map<string, number>();
  const base = resolve(OVERLAYS, '_base');
  if (!existsSync(base)) return out;
  for (const f of readdirSync(base)) {
    if (!f.endsWith('.json')) continue;
    const parsed = JSON.parse(readFileSync(resolve(base, f), 'utf8'));
    const records: BaseRecord[] = Array.isArray(parsed) ? parsed : [parsed];
    for (const r of records) {
      const d = r.domain ?? f.replace(/\.json$/, '');
      out.set(d, (out.get(d) ?? 0) + 1);
    }
  }
  return out;
}

/** Expansion countries (overlay dirs other than _base), with their state. */
function countries(): Array<{ code: string; signedOff: boolean; profiled: boolean; overlays: number }> {
  const out: Array<{ code: string; signedOff: boolean; profiled: boolean; overlays: number }> = [];
  for (const entry of readdirSync(OVERLAYS)) {
    const dir = resolve(OVERLAYS, entry);
    if (entry === '_base' || !statSync(dir).isDirectory()) continue;
    const overlayFile = resolve(dir, 'overlay.json');
    if (!existsSync(overlayFile)) continue;
    const overlay = JSON.parse(readFileSync(overlayFile, 'utf8'));
    const recordsDir = resolve(dir, 'records');
    const overlays =
      existsSync(recordsDir) && statSync(recordsDir).isDirectory()
        ? readdirSync(recordsDir).filter((f) => f.endsWith('.json')).length
        : 0;
    out.push({
      code: entry,
      signedOff: Boolean(overlay.signedOff),
      profiled: Boolean(overlay.profile),
      overlays,
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}

function generate(): string {
  const ke = kenyaDomains();
  const base = baselineDomains();
  const ccs = countries();
  const cls = domainClassification();
  const date = new Date().toISOString().slice(0, 10);

  const counts = { universal: 0, 'national-divergent': 0, mixed: 0, unclassified: 0 };
  for (const d of ke) counts[cls[d] ?? 'unclassified'] += 1;
  const inheritable = counts.universal;
  const needsOverlay = counts['national-divergent'] + counts.mixed;

  const baselineRows = [...base.entries()]
    .sort()
    .map(([d, n]) => `| \`${d}\` | ${n} | draft | all ${ccs.length} countries |`)
    .join('\n');

  const countryRows = ccs
    .map(
      (c) =>
        `| ${c.code} | ${c.profiled ? '✅' : '—'} | ${base.size} (draft) | ${c.overlays} | ${
          c.signedOff ? '✅ signed-off' : '🟡 in-progress'
        } |`,
    )
    .join('\n');

  return `# Parity matrix — 9 anglophone countries toward Kenya level

_Generated ${date} by \`npm run parity:matrix\`. Goal: every country supported
to the same level as Kenya._

## Parity model

Most clinical content is universal and is authored ONCE as the WHO baseline,
which every country inherits. National overlays are authored only for genuinely
country-divergent topics (EML drug choices, immunization schedules, national
HIV/TB/malaria protocols). A country reaches Kenya-level parity when the WHO
baseline + its national overlays cover the Kenya domain set and are clinically
signed off.

## WHO baseline layer (inherited by all countries, draft)

| Domain | Records | Status | Inherited by |
|---|---|---|---|
${baselineRows || '| _(none yet)_ | | | |'}

## Country status

| Country | Locale profile | Baseline domains inherited | National overlays | Sign-off |
|---|---|---|---|---|
${countryRows}

## Kenya parity target (signed-bundle domains)

Each domain reaches parity one of two ways — **universal** content is inherited
by every country once the baseline is promoted; **national-divergent / mixed**
content needs a per-country overlay.

| Domain | Path to parity |
|---|---|
${ke.map((d) => `| \`${d}\` | ${cls[d] ?? 'unclassified'} |`).join('\n')}

## Parity summary

- **${inheritable} of ${ke.length}** Kenya domains are **universal** — inheritable by all 9 countries once the baseline is promoted (no per-country authoring).
- **${needsOverlay} of ${ke.length}** are **national-divergent / mixed** — these are the focused per-country authoring backlog (EML drug choices, immunization schedules, notifiable lists, national first-line protocols).
- WHO baseline topic-domains authored so far: **${base.size}** (draft).

_National clinical authoring + clinical sign-off remain the gate to flipping any
country to \`localized\`._
`;
}

const md = generate();
writeFileSync(resolve(OVERLAYS, 'PARITY.md'), md);
console.log(`Wrote content/overlays/PARITY.md (${baselineDomains().size} baseline domains).`);
