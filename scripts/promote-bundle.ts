#!/usr/bin/env ts-node
/**
 * Clinical content promotion: draft → review → approved.
 *
 *   npm run bundle:promote -- --to review   --domain drugs --slug amoxicillin
 *   npm run bundle:promote -- --to approved --domain drugs --slug amoxicillin \
 *       --reviewer "A. Mwangi:Consultant Physician" \
 *       --reviewer "B. Otieno:Clinical Pharmacologist"
 *   npm run bundle:promote -- --status                 # what is where
 *
 * Why this exists: everything downstream of promotion already worked —
 * `sign-bundle.ts` refuses to sign unapproved content without --allow-draft,
 * `bundle-validator.ts` enforces FR-024's two named reviewers, and the
 * CONTENT_REQUIRE_APPROVED runtime gate is built. The missing pieces were a
 * tool to actually promote a record and somewhere to record WHO approved it.
 * Step 3 of the documented workflow ("promote the records into the next signed
 * bundle as approved") had no implementation, which is why the shipped bundle
 * is 7,144 draft records and 0 approved.
 *
 * Safety properties this tool enforces, deliberately:
 *   - Approval requires at least two named reviewers with a role each. A
 *     record cannot approve itself, and a reviewer cannot be anonymous.
 *   - Promotion is one step at a time: draft → review → approved. Jumping
 *     straight from draft to approved would skip the review state that tells
 *     a reviewer there is something to look at.
 *   - A record whose only citation is a D-tier (consumer / wiki) source cannot
 *     be approved at all. `check-citation-strength.js` explicitly defers this
 *     check to "the clinical-review process"; this is that check.
 *
 * Exit codes:
 *   0  promoted (or --status / --dry-run reported cleanly)
 *   1  usage error
 *   2  refused: a safety invariant would be violated
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

type Status = 'draft' | 'review' | 'approved' | 'deprecated';
const ORDER: Status[] = ['draft', 'review', 'approved'];

/**
 * Ratchet ceiling for unapproved records, in the same spirit as the citation
 * ratchets in check-citation-links.js: it may only ever move DOWN.
 *
 * The CI approval gate was `continue-on-error: true` AND scoped to the main
 * branch, so it never blocked anything and never ran on a pull request — a
 * gate in name only. Blocking on the whole 7,144-record backlog would stop
 * every release, so instead this holds the line: the backlog is tolerated, but
 * new unapproved content cannot be added. Lower this number as records are
 * promoted; when it reaches 0, flip CONTENT_REQUIRE_APPROVED on and make the
 * bundle-verify approval step a hard failure.
 */
const MAX_UNAPPROVED = 7144;

interface Reviewer {
  name: string;
  role: string;
  reviewedAt: string;
}
type Rec = Record<string, unknown> & {
  slug?: string;
  reviewStatus?: Status;
  reviewers?: Reviewer[];
  approvedAt?: string;
  references?: Array<{ strength?: string; label?: string }>;
};

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
function flagAll(name: string): string[] {
  const out: string[] = [];
  args.forEach((a, i) => {
    if (a === `--${name}` && args[i + 1]) out.push(args[i + 1]);
  });
  return out;
}
const has = (name: string) => args.includes(`--${name}`);

const BUNDLE = resolve(process.cwd(), flag('bundle') ?? 'content/bundles/v0.1.0');

function domainFiles(): string[] {
  return readdirSync(BUNDLE).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
}

function readDomain(file: string): Rec[] {
  const raw = JSON.parse(readFileSync(join(BUNDLE, file), 'utf8'));
  return Array.isArray(raw) ? (raw as Rec[]) : [];
}

/** A record backed only by D-tier sources is not fit to be approved. */
function soleDTier(rec: Rec): boolean {
  const tiers = (rec.references ?? [])
    .map((r) => (r.strength ?? '').toUpperCase())
    .filter((s) => s.length === 1);
  if (tiers.length === 0) return true; // no graded citation at all
  return tiers.every((t) => t === 'D');
}

function parseReviewers(): Reviewer[] {
  const now = new Date().toISOString();
  return flagAll('reviewer').map((spec) => {
    const [name, role] = spec.split(':').map((s) => s?.trim());
    return { name: name ?? '', role: role ?? '', reviewedAt: now };
  });
}

function statusReport(): void {
  const totals: Record<string, number> = {};
  const perDomain: Array<[string, Record<string, number>]> = [];
  for (const file of domainFiles()) {
    const counts: Record<string, number> = {};
    for (const rec of readDomain(file)) {
      const s = rec.reviewStatus ?? 'none';
      counts[s] = (counts[s] ?? 0) + 1;
      totals[s] = (totals[s] ?? 0) + 1;
    }
    perDomain.push([file.replace(/\.json$/, ''), counts]);
  }
  console.log(`Content promotion status — ${BUNDLE}\n`);
  for (const [domain, counts] of perDomain.sort((a, b) => a[0].localeCompare(b[0]))) {
    const parts = Object.entries(counts)
      .sort()
      .map(([k, v]) => `${k}=${v}`)
      .join('  ');
    console.log(`  ${domain.padEnd(28)} ${parts}`);
  }
  const totalParts = Object.entries(totals)
    .sort()
    .map(([k, v]) => `${k}=${v}`)
    .join('  ');
  console.log(`\n  TOTAL  ${totalParts}`);
  const approved = totals.approved ?? 0;
  const all = Object.values(totals).reduce((a, b) => a + b, 0);
  console.log(
    `\n  ${approved}/${all} approved. ` +
      (approved === 0
        ? 'Nothing is approved yet, so CONTENT_REQUIRE_APPROVED must stay off and the CI ' +
          'approval gate stays advisory.'
        : 'Flip CONTENT_REQUIRE_APPROVED and the CI gate once this reaches 100%.'),
  );
}

/** CI gate: the unapproved backlog may shrink but never grow. */
function ratchetCheck(): void {
  let unapproved = 0;
  let total = 0;
  for (const file of domainFiles()) {
    for (const rec of readDomain(file)) {
      total += 1;
      if ((rec.reviewStatus ?? 'draft') !== 'approved') unapproved += 1;
    }
  }
  console.log('Content approval ratchet');
  console.log(`  unapproved records: ${unapproved} (ratchet ≤ ${MAX_UNAPPROVED}) of ${total}`);

  if (unapproved > MAX_UNAPPROVED) {
    console.error(
      `\nFAILED: unapproved records grew to ${unapproved} (ceiling ${MAX_UNAPPROVED}). ` +
        'New clinical content must go through review before it ships — promote it with ' +
        '`npm run bundle:promote`, or lower the ceiling only when records have actually ' +
        'been approved.',
    );
    process.exit(1);
  }
  if (unapproved < MAX_UNAPPROVED) {
    console.log(
      `\nThe backlog has shrunk. Lower MAX_UNAPPROVED in scripts/promote-bundle.ts to ` +
        `${unapproved} so it cannot creep back up.`,
    );
  }
  if (unapproved === 0) {
    console.log(
      '\nEverything is approved. Set CONTENT_REQUIRE_APPROVED=true and make the ' +
        'bundle-verify approval step a hard failure (drop continue-on-error in ci.yml).',
    );
  }
}

function main(): void {
  if (has('status')) {
    statusReport();
    return;
  }
  if (has('check')) {
    ratchetCheck();
    return;
  }

  const to = flag('to') as Status | undefined;
  const domain = flag('domain');
  const slug = flag('slug');
  const dryRun = has('dry-run');

  if (!to || !domain || !slug) {
    console.error(
      'Usage: bundle:promote -- --to <review|approved> --domain <domain> --slug <slug> ' +
        '[--reviewer "Name:Role" ...] [--dry-run]\n' +
        '       bundle:promote -- --status   # per-domain backlog\n' +
        '       bundle:promote -- --check    # CI ratchet: backlog must not grow',
    );
    process.exit(1);
  }
  if (!ORDER.includes(to)) {
    console.error(`--to must be one of: review, approved (got '${to}').`);
    process.exit(1);
  }

  const file = `${domain}.json`;
  let records: Rec[];
  try {
    records = readDomain(file);
  } catch {
    console.error(`No such domain file: ${join(BUNDLE, file)}`);
    process.exit(1);
    return;
  }

  const idx = records.findIndex((r) => r.slug === slug);
  if (idx === -1) {
    console.error(`No record with slug '${slug}' in ${file}.`);
    process.exit(1);
    return;
  }

  const rec = records[idx];
  const from = rec.reviewStatus ?? 'draft';
  const refusals: string[] = [];

  // One step at a time: the review state is what tells a reviewer there is
  // something waiting for them.
  const fromIdx = ORDER.indexOf(from as Status);
  const toIdx = ORDER.indexOf(to);
  if (fromIdx === -1) refusals.push(`current status '${from}' cannot be promoted`);
  else if (toIdx !== fromIdx + 1) {
    refusals.push(`cannot go from '${from}' to '${to}' — promote one step at a time`);
  }

  let reviewers = rec.reviewers ?? [];
  if (to === 'approved') {
    const added = parseReviewers();
    for (const r of added) {
      if (!r.name || !r.role) {
        refusals.push(`--reviewer must be "Name:Role" (got "${r.name}:${r.role}")`);
      }
    }
    reviewers = [...reviewers, ...added];
    if (reviewers.length < 2) {
      refusals.push(
        `approval requires at least two named reviewers (FR-024); this record would have ${reviewers.length}`,
      );
    }
    if (soleDTier(rec)) {
      refusals.push(
        'approval refused: the only graded citation(s) are D-tier (consumer/wiki) or absent — ' +
          'a D-tier source may not be the sole reference for a clinical recommendation',
      );
    }
  }

  if (refusals.length > 0) {
    console.error(`Refusing to promote ${domain}/${slug} (${from} → ${to}):`);
    for (const r of refusals) console.error(`  - ${r}`);
    process.exit(2);
  }

  const updated: Rec = { ...rec, reviewStatus: to };
  if (to === 'approved') {
    updated.reviewers = reviewers;
    updated.approvedAt = new Date().toISOString();
  }

  if (dryRun) {
    console.log(`[dry-run] ${domain}/${slug}: ${from} → ${to}`);
    if (to === 'approved') {
      console.log(`  reviewers: ${reviewers.map((r) => `${r.name} (${r.role})`).join(', ')}`);
    }
    return;
  }

  records[idx] = updated;
  writeFileSync(join(BUNDLE, file), `${JSON.stringify(records, null, 2)}\n`);
  console.log(`${domain}/${slug}: ${from} → ${to}`);
  if (to === 'approved') {
    console.log(`  reviewers: ${reviewers.map((r) => `${r.name} (${r.role})`).join(', ')}`);
  }
  console.log(
    '\nRemember: the bundle must be re-signed for this to take effect ' +
      '(npm run bundle:sign), and the manifest digests change.',
  );
}

main();
