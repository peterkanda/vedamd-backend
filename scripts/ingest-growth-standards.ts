/* eslint-disable no-console */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Fetch WHO / CDC growth-standard LMS tables into content/growth/lms/.
 *
 * `growth-development.json` states its thresholds in z-scores and the
 * platform could not compute one, because the bundle carries no LMS
 * parameters. This fills that gap from the published tables.
 *
 * Usage:
 *   npm run growth:ingest -- --dry-run     # check every URL, write nothing
 *   npm run growth:ingest                  # fetch and write
 *   npm run growth:ingest -- --source who  # override the per-indicator pick
 *
 * Output is a DRAFT lane beside the signed bundle, like content/labels/:
 * it is not signed content and is not served as approved until it has been
 * reviewed and promoted.
 */

interface SourceEntry {
  indicator: string;
  title: string;
  xUnit: 'months' | 'cm';
  xRange: [number, number];
  preferred: 'who' | 'cdc';
  sources: Record<string, { male: string; female: string }>;
}

const ROOT = resolve(__dirname, '..');
const SOURCES = resolve(ROOT, 'content/growth/sources.json');
const OUT_DIR = resolve(ROOT, 'content/growth/lms');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}
const dryRun = process.argv.includes('--dry-run');
const forceSource = arg('--source');

/**
 * Parse a CDC LMS csv into points.
 *
 * CDC publishes `Sex,Agemos,L,M,S,P3,...` (or `Length` in place of `Agemos`
 * on the weight-for-length charts). Columns are matched by header name
 * rather than position, because the exact column set differs per chart and
 * silently reading the wrong column would produce plausible, wrong z-scores.
 */
function parseCdcCsv(text: string, xUnit: 'months' | 'cm') {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('csv has no data rows');
  const header = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const xCol = header.findIndex((h) =>
    xUnit === 'cm' ? /length|height/.test(h) : /agemos|age/.test(h),
  );
  const lCol = header.indexOf('l');
  const mCol = header.indexOf('m');
  const sCol = header.indexOf('s');
  if (xCol === -1 || lCol === -1 || mCol === -1 || sCol === -1) {
    throw new Error(`csv missing a required column; saw [${header.join(', ')}]`);
  }
  const points = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const x = Number(cells[xCol]);
    const l = Number(cells[lCol]);
    const m = Number(cells[mCol]);
    const s = Number(cells[sCol]);
    if (![x, l, m, s].every(Number.isFinite)) continue;
    points.push({ x, l, m, s });
  }
  return points.sort((a, b) => a.x - b.x);
}

/**
 * Sanity-check a parsed table before it is allowed to become content.
 *
 * A silently malformed standard is worse than a missing one: every z-score
 * computed from it would look reasonable and be wrong.
 */
function validate(points: { x: number; l: number; m: number; s: number }[], e: SourceEntry) {
  const problems: string[] = [];
  if (points.length < 10) problems.push(`only ${points.length} rows`);
  if (points.some((p) => p.m <= 0)) problems.push('a non-positive median');
  if (points.some((p) => p.s <= 0)) problems.push('a non-positive S');
  if (points.some((p) => Math.abs(p.l) > 5)) problems.push('an implausible L');
  const medians = points.map((p) => p.m);
  // Every one of these standards is monotonically increasing in x.
  if (medians.some((m, i) => i > 0 && m < medians[i - 1])) {
    problems.push('a median that decreases with age/length');
  }
  const [lo, hi] = e.xRange;
  if (points[0].x > lo + 1 || points[points.length - 1].x < hi - 1) {
    problems.push(`covers ${points[0].x}-${points[points.length - 1].x}, expected ${lo}-${hi}`);
  }
  return problems;
}

async function main() {
  const cfg = JSON.parse(readFileSync(SOURCES, 'utf8')) as { indicators: SourceEntry[] };
  if (!dryRun) mkdirSync(OUT_DIR, { recursive: true });

  let failures = 0;
  let written = 0;

  for (const e of cfg.indicators) {
    const which = forceSource ?? e.preferred;
    const set = e.sources[which];
    if (!set) {
      console.error(`✗ ${e.indicator}: no "${which}" source configured`);
      failures++;
      continue;
    }
    for (const sex of ['male', 'female'] as const) {
      const url = set[sex];
      const label = `${e.indicator}/${sex} (${which})`;
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = await res.text();
        if (!/^[\s\S]{0,200}?,/.test(body)) {
          throw new Error('response is not delimited text — is this the .xlsx rather than a csv?');
        }
        const points = parseCdcCsv(body, e.xUnit);
        const problems = validate(points, e);
        if (problems.length) throw new Error(problems.join('; '));

        console.log(`✓ ${label}: ${points.length} rows`);
        if (!dryRun) {
          writeFileSync(
            resolve(OUT_DIR, `${e.indicator}-${sex}.json`),
            JSON.stringify(
              {
                indicator: e.indicator,
                title: e.title,
                sex,
                xUnit: e.xUnit,
                source: which,
                sourceUrl: url,
                retrievedAt: new Date().toISOString(),
                reviewStatus: 'draft',
                points,
              },
              null,
              2,
            ) + '\n',
          );
          written++;
        }
      } catch (err) {
        console.error(`✗ ${label}: ${(err as Error).message}`);
        console.error(`    ${url}`);
        failures++;
      }
    }
  }

  console.log(
    `\n${written} table(s) written, ${failures} failed.` +
      (failures ? ' Nothing partial was written for a failed table.' : ''),
  );
  // A partial standard set is a clinical hazard, so a failure is an error.
  process.exit(failures > 0 ? 1 : 0);
}

void main();
