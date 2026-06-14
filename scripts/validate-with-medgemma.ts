#!/usr/bin/env ts-node
/**
 * Validate authored clinical content with a medical LLM reviewer (second opinion).
 *
 *   npm run validate:medgemma -- --dry-run         # build prompts, no network
 *   npm run validate:claude                        # review all overlays with Claude
 *   npm run validate:medgemma -- --country UG      # review one country
 *
 * Reviewer backend (auto-selected, or force with --reviewer claude|medgemma):
 *   - Claude:   set ANTHROPIC_API_KEY (+ ANTHROPIC_REVIEW_MODEL, default Opus).
 *   - MedGemma: set OPENROUTER_API_KEY + AGENTIC_OPENROUTER_BASE_URL/MODEL
 *               (a self-hosted, OpenAI-compatible MedGemma endpoint).
 * Asks the model to flag medical inaccuracies (esp. drug choice / dosing) and
 * writes content/validation/medgemma-review.{json,md}.
 *
 * IMPORTANT: this is a SCREEN, not an oracle — the reviewer is itself an LLM. A
 * flag means "a human should look", an "ok" means "no concern raised", neither
 * is approval. Records are cross-checked for citations alongside the verdict.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MEDGEMMA_REVIEW_SYSTEM,
  buildReviewPrompt,
  parseReviewVerdict,
  isFlagged,
  type ReviewableRecord,
  type ReviewResult,
} from '../src/common/clinical-review/medgemma-review';

const ROOT = process.cwd();
const OVERLAYS = resolve(ROOT, 'content/overlays');
const OUT_DIR = resolve(ROOT, 'content/validation');

const CLINICAL_FIELDS = [
  'presentation', 'redFlags', 'diagnostics', 'management', 'doses', 'classification',
  'treatment', 'treatmentUncomplicated', 'treatmentSevere', 'targets', 'monitoring',
  'principles', 'notes', 'summary', 'targetDisease', 'level', 'timeframe',
];

function serialize(rec: Record<string, unknown>): string {
  const out: Record<string, unknown> = {};
  for (const k of CLINICAL_FIELDS) if (rec[k] !== undefined) out[k] = rec[k];
  let s = JSON.stringify(out, null, 1);
  if (s.length > 2500) s = s.slice(0, 2500) + '…';
  return s;
}

/** Load reviewable records from the country overlays (records/*.json). */
function loadOverlayRecords(country?: string): Array<ReviewableRecord & { file: string }> {
  const out: Array<ReviewableRecord & { file: string }> = [];
  for (const entry of readdirSync(OVERLAYS)) {
    if (country && entry.toUpperCase() !== country.toUpperCase()) continue;
    const recordsDir = resolve(OVERLAYS, entry, 'records');
    if (!existsSync(recordsDir) || !statSync(recordsDir).isDirectory()) continue;
    for (const f of readdirSync(recordsDir)) {
      if (!f.endsWith('.json')) continue;
      const recs = JSON.parse(readFileSync(resolve(recordsDir, f), 'utf8'));
      for (const rec of Array.isArray(recs) ? recs : []) {
        out.push({
          file: `${entry}/records/${f}`,
          slug: rec.slug,
          title: rec.title ?? rec.vaccine ?? rec.disease,
          domain: rec.domain ?? f.replace(/\.json$/, ''),
          jurisdiction: rec.jurisdiction,
          content: serialize(rec),
          references: rec.references,
        });
      }
    }
  }
  return out;
}

interface ReviewerCfg {
  backend: 'openai' | 'anthropic';
  key: string;
  model: string;
  baseUrl: string;
}

/** Dispatch to the configured reviewer model (MedGemma via OpenAI-compatible, or Claude). */
async function reviewOne(rec: ReviewableRecord, cfg: ReviewerCfg): Promise<ReviewResult> {
  if (cfg.backend === 'anthropic') {
    const res = await fetch(`${cfg.baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': cfg.key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: 600,
        temperature: 0,
        system: MEDGEMMA_REVIEW_SYSTEM,
        messages: [{ role: 'user', content: buildReviewPrompt(rec) }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic review HTTP ${res.status}`);
    const json = (await res.json()) as { content?: Array<{ text?: string }> };
    return parseReviewVerdict(json.content?.[0]?.text ?? '');
  }
  // OpenAI-compatible (MedGemma via vLLM / OpenRouter / etc.)
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      max_tokens: 600,
      messages: [
        { role: 'system', content: MEDGEMMA_REVIEW_SYSTEM },
        { role: 'user', content: buildReviewPrompt(rec) },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Review endpoint HTTP ${res.status}`);
  const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return parseReviewVerdict(json.choices?.[0]?.message?.content ?? '');
}

/** Resolve which reviewer to use from flags + env. Returns null when none configured. */
function resolveReviewer(args: string[]): ReviewerCfg | null {
  const ri = args.indexOf('--reviewer');
  const pref = ri >= 0 ? args[ri + 1] : '';
  const anthropicKey = process.env.ANTHROPIC_API_KEY ?? '';
  const openaiKey = process.env.OPENROUTER_API_KEY ?? '';
  const wantAnthropic = pref === 'anthropic' || pref === 'claude' || (!pref && !openaiKey && anthropicKey);
  if (wantAnthropic && anthropicKey) {
    return {
      backend: 'anthropic',
      key: anthropicKey,
      model: process.env.ANTHROPIC_REVIEW_MODEL ?? 'claude-opus-4-8',
      baseUrl: process.env.ANTHROPIC_BASE_URL ?? 'https://api.anthropic.com',
    };
  }
  if (openaiKey) {
    return {
      backend: 'openai',
      key: openaiKey,
      model: process.env.AGENTIC_OPENROUTER_MODEL ?? 'google/medgemma-27b-text-it',
      baseUrl: process.env.AGENTIC_OPENROUTER_BASE_URL ?? 'https://openrouter.ai/api/v1',
    };
  }
  return null;
}

async function run() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const all = args.includes('--all');
  const ci = args.indexOf('--country');
  const country = ci >= 0 ? args[ci + 1] : all ? undefined : undefined;
  const li = args.indexOf('--limit');
  const limit = li >= 0 ? Number(args[li + 1]) : Infinity;

  const records = loadOverlayRecords(country).slice(0, limit);
  console.log(`Loaded ${records.length} overlay record(s) to review${country ? ` for ${country}` : ''}.`);

  if (dryRun) {
    console.log('\n--dry-run: showing the prompt for the first record (no network call):\n');
    if (records[0]) console.log(buildReviewPrompt(records[0]).slice(0, 1200));
    console.log(`\nWould send ${records.length} review request(s) to the configured MedGemma endpoint.`);
    return;
  }

  const cfg = resolveReviewer(args);
  if (!cfg) {
    const msg =
      'No reviewer configured. Set ANTHROPIC_API_KEY (Claude reviewer) OR ' +
      'OPENROUTER_API_KEY + AGENTIC_OPENROUTER_BASE_URL/MODEL (MedGemma endpoint), or use --dry-run.';
    if (args.includes('--require-endpoint')) {
      console.error(msg);
      process.exit(1);
    }
    console.log(`Skipped — ${msg}`);
    return;
  }
  console.log(`Reviewer: ${cfg.backend} (${cfg.model}).`);

  const results: Array<{ rec: ReviewableRecord & { file: string }; r: ReviewResult }> = [];
  for (const rec of records) {
    try {
      const r = await reviewOne(rec, cfg);
      results.push({ rec, r });
      process.stdout.write(r.verdict === 'ok' ? '.' : r.verdict === 'error' ? 'E' : '?');
    } catch (e) {
      results.push({ rec, r: { verdict: 'unknown', dosingConcern: false, issues: [`Review failed: ${(e as Error).message}`], confidence: 0 } });
      process.stdout.write('x');
    }
  }
  process.stdout.write('\n');

  const rank: Record<string, number> = { error: 0, concern: 1, unknown: 2, ok: 3 };
  results.sort((a, b) => rank[a.r.verdict] - rank[b.r.verdict]);
  const flagged = results.filter(({ r }) => isFlagged(r));

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    resolve(OUT_DIR, 'medgemma-review.json'),
    `${JSON.stringify({ model: cfg.model, reviewedAt: new Date().toISOString(), total: results.length, flagged: flagged.length, results: results.map(({ rec, r }) => ({ file: rec.file, slug: rec.slug, jurisdiction: rec.jurisdiction, ...r, cited: (rec.references?.length ?? 0) > 0 })) }, null, 2)}\n`,
  );
  const md = [
    `# MedGemma content review`,
    ``,
    `Model: \`${cfg.model}\` · reviewed ${results.length} records · **${flagged.length} flagged** for human review.`,
    `_Automated screen — a flag is "look here", not a fact; "ok" is not approval._`,
    ``,
    `| Verdict | Dosing | Record | Issues |`,
    `|---|---|---|---|`,
    ...flagged.map(({ rec, r }) => `| ${r.verdict} | ${r.dosingConcern ? '⚠️' : ''} | \`${rec.jurisdiction ?? ''}/${rec.slug ?? '?'}\` | ${r.issues.join('; ').replace(/\|/g, '/').slice(0, 200)} |`),
  ].join('\n');
  writeFileSync(resolve(OUT_DIR, 'medgemma-review.md'), `${md}\n`);
  console.log(`Reviewed ${results.length}; ${flagged.length} flagged → content/validation/medgemma-review.md`);

  // CI gate: fail when MedGemma flags a likely medical ERROR (not mere concerns).
  const errors = results.filter(({ r }) => r.verdict === 'error');
  if (args.includes('--fail-on-error') && errors.length > 0) {
    console.error(`\nFAILED (--fail-on-error): ${errors.length} record(s) flagged as likely error.`);
    process.exit(1);
  }
}

run();
