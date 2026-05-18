/* eslint-disable @typescript-eslint/no-explicit-any, no-console */
import { resolve } from 'node:path';

/**
 * Verify a content bundle directory WITHOUT signing it.
 *
 * Usage:
 *   npm run bundle:verify -- --bundle content/bundles/v0.1.0
 *   npm run bundle:verify -- --bundle content/bundles/v0.1.0 --require-approved
 *
 * Exit codes:
 *   0  — all checks passed
 *   2  — content structural violation (e.g. approved without 2 reviewers)
 *   3  — non-approved records present and --require-approved set
 *   4  — signature / hash / file verification failed
 *
 * Always prints a one-line summary suitable for GitHub Actions step
 * summaries. With $GITHUB_STEP_SUMMARY set, also writes a Markdown
 * report there.
 */

function arg(argv: string[], name: string, fallback?: string): string {
  const i = argv.indexOf(name);
  if (i === -1 || i + 1 >= argv.length) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required argument: ${name}`);
  }
  return argv[i + 1];
}

const argv = process.argv.slice(2);
const bundleDir = resolve(process.cwd(), arg(argv, '--bundle', 'content/bundles/v0.1.0'));
const requireApproved = argv.includes('--require-approved');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { loadBundleFromDisk } = require('../src/modules/knowledge/bundle-loader');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { nonApprovedCount } = require('../src/modules/knowledge/bundle-validator');

let exitCode = 0;
let summary = '';

try {
  // Strict mode = throw on any signature / hash / structure failure.
  const bundle = loadBundleFromDisk(bundleDir, { strict: true, requireApproved });
  const info = bundle.info;
  const stats = info.contentStats;

  const lines: string[] = [];
  lines.push(`### VedaMD bundle verification`);
  lines.push('');
  lines.push(`- **Bundle**: \`${bundleDir}\``);
  lines.push(`- **Version**: ${info.version}`);
  lines.push(`- **Signed by**: ${info.signedBy} at ${info.signedAt}`);
  lines.push(`- **Signature + hashes**: ${info.verified ? '✅ verified' : '❌ failed'}`);
  if (stats) {
    lines.push(`- **Records**: ${stats.totalRecords} total`);
    lines.push(
      `- **By status**: ${stats.byStatus.approved} approved · ${stats.byStatus.draft} draft · ${stats.byStatus.review} review · ${stats.byStatus.deprecated} deprecated`,
    );
    const nonApp = nonApprovedCount(stats);
    if (nonApp > 0) {
      if (requireApproved) {
        lines.push(
          `- **Approval gate**: ❌ ${nonApp} non-approved record(s) found; \`--require-approved\` is set.`,
        );
      } else {
        lines.push(
          `- **Approval gate**: ⚠ ${nonApp} non-approved record(s) present (allowed in v0.1 dev mode).`,
        );
      }
    } else {
      lines.push(`- **Approval gate**: ✅ all records approved`);
    }
  }
  lines.push('');
  summary = lines.join('\n');

  if (requireApproved && stats && nonApprovedCount(stats) > 0) {
    exitCode = 3;
  }
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  summary = `### VedaMD bundle verification\n\n❌ ${msg}\n`;
  if (/signature|hash|missing|manifest/.test(msg)) {
    exitCode = 4;
  } else if (/non-approved-content/.test(msg)) {
    exitCode = 3;
  } else if (/content-validation-failed/.test(msg)) {
    exitCode = 2;
  } else {
    exitCode = 1;
  }
}

console.log(summary);

if (process.env.GITHUB_STEP_SUMMARY) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('node:fs') as typeof import('node:fs');
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary + '\n');
}

process.exit(exitCode);
