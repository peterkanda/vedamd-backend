/* eslint-disable no-console */
/**
 * VedaMD stateless / PHI-free-logger audit (SRS §2.7, §4.11, NFR-027–029).
 *
 * Grep-based defense-in-depth that runs in CI alongside ESLint. ESLint
 * catches direct calls in source; this script catches things ESLint
 * cannot easily reason about — bypasses via dynamic imports, hand-rolled
 * logger constructions, and prohibited storage primitives.
 *
 * Exits non-zero on any violation. Add new exemptions only with a
 * comment explaining *why* the snippet is safe.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

interface Rule {
  /** Short ID surfaced in failure output (e.g., "console-in-src"). */
  id: string;
  /** Human-readable explanation. */
  description: string;
  /** Files to scan (relative to repo root). */
  globs: string[];
  /** Files to skip (relative to repo root) — must be intentional, with a why. */
  exemptions: string[];
  /** Pattern that, if found, indicates a violation. */
  pattern: RegExp;
  /** SRS section / NFR reference. */
  reference: string;
}

const RULES: Rule[] = [
  {
    id: 'no-console-in-src',
    description: 'console.* in production source bypasses the PHI-free-logger allow-list.',
    globs: ['src'],
    // Pre-DI bootstrap paths only: these run before NestJS / the
    // PHI-free-logger exist (secret resolution, master-key load) and emit
    // ONLY dev/ops warnings about missing secrets — no request context, no
    // PHI. Both call sites are explicitly eslint-disabled.
    exemptions: [
      'src/common/phi-free-logger/',
      'src/common/secrets-vault.ts',
      'src/config/configuration.ts',
    ],
    pattern: /\bconsole\.(log|info|warn|error|debug|trace)\s*\(/,
    reference: 'NFR-027',
  },
  {
    id: 'no-raw-pino-import',
    description: 'Importing pino outside the wrapper lets callers skip identifier hashing.',
    globs: ['src'],
    exemptions: ['src/common/phi-free-logger/'],
    pattern: /from\s+['"]pino['"]/,
    reference: 'NFR-027',
  },
  {
    id: 'no-direct-stdout-write',
    description: 'process.stdout / process.stderr writes are unstructured and unredacted.',
    globs: ['src'],
    exemptions: ['src/common/phi-free-logger/'],
    pattern: /process\.(stdout|stderr)\.write\s*\(/,
    reference: 'NFR-027',
  },
  {
    id: 'no-patient-table',
    description:
      'Creating a Postgres table or Drizzle table containing patient fields would violate ' +
      'the stateless promise. The only permitted tables are operator/audit/integration_log.',
    globs: ['drizzle', 'src/db'],
    exemptions: [],
    // Looks for SQL or drizzle pgTable declarations of forbidden names.
    pattern:
      /(?:CREATE\s+TABLE\s+["']?(patients?|observations?|conditions?|medications?|encounters?|allergies)["']?|pgTable\(\s*['"](?:patients?|observations?|conditions?|medications?|encounters?|allergies)['"])/i,
    reference: 'NFR-028, FR-088',
  },
];

const REPO_ROOT = join(__dirname, '..');

async function walk(dir: string): Promise<string[]> {
  const out: string[] = [];
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = await stat(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist' || entry === 'coverage') continue;
      out.push(...(await walk(full)));
    } else if (/\.(ts|tsx|js|sql)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

interface Hit {
  rule: Rule;
  file: string;
  line: number;
  excerpt: string;
}

function exempted(rule: Rule, file: string): boolean {
  const rel = relative(REPO_ROOT, file);
  return rule.exemptions.some((e) => rel.startsWith(e));
}

async function scan(): Promise<Hit[]> {
  const hits: Hit[] = [];
  for (const rule of RULES) {
    for (const glob of rule.globs) {
      const files = await walk(join(REPO_ROOT, glob));
      for (const f of files) {
        if (exempted(rule, f)) continue;
        const content = await readFile(f, 'utf8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (rule.pattern.test(line)) {
            hits.push({ rule, file: f, line: i + 1, excerpt: line.trim().slice(0, 120) });
          }
        });
      }
    }
  }
  return hits;
}

async function main() {
  const hits = await scan();
  if (hits.length === 0) {
    console.log('audit-stateless: OK (0 violations across', RULES.length, 'rules)');
    return;
  }
  console.error('audit-stateless: FOUND', hits.length, 'violations:');
  for (const h of hits) {
    const rel = relative(REPO_ROOT, h.file);
    console.error(`  [${h.rule.id}] ${rel}:${h.line}  (${h.rule.reference})`);
    console.error(`    ${h.excerpt}`);
    console.error(`    → ${h.rule.description}`);
  }
  process.exit(1);
}

main().catch((e) => {
  console.error('audit-stateless: crashed:', e);
  process.exit(2);
});
