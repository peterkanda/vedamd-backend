import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CdsRule } from '../src/modules/conditions/conditions.types';

/**
 * Rule-execution coverage guard.
 *
 * Every cds-rule must be reachable: it either (a) has a bespoke strategy
 * registered for its `type`, (b) carries `outcomes[]` so the generic
 * BundleOutcomeStrategy can render it, or (c) is explicitly flagged
 * `documentationOnly: true` (reference content that intentionally never
 * fires). Anything else is a "dark" rule — signed and loaded but silently
 * skipped at evaluation. That was the single biggest CDS content gap; this
 * test prevents it from regressing.
 *
 * The set of registered strategy types is derived from the strategy source
 * files' `readonly type = '...'` declarations so it can never drift from
 * what the registry actually wires.
 */

const STRATEGY_DIR = resolve(process.cwd(), 'src/modules/cds/strategies');
const RULES_PATH = resolve(process.cwd(), 'content/bundles/v0.1.0/cds-rules.json');

function registeredStrategyTypes(): Set<string> {
  const { readdirSync } = require('node:fs') as typeof import('node:fs');
  const files = readdirSync(STRATEGY_DIR).filter((f: string) => f.endsWith('.strategy.ts'));
  const types = new Set<string>();
  for (const f of files) {
    const src = readFileSync(resolve(STRATEGY_DIR, f), 'utf8');
    const m = src.match(/readonly\s+type\s*=\s*'([^']+)'/);
    if (m && m[1] !== '__bundle-outcome__') types.add(m[1]);
  }
  return types;
}

function loadRules(): CdsRule[] {
  const raw = JSON.parse(readFileSync(RULES_PATH, 'utf8'));
  return Array.isArray(raw) ? raw : raw.records;
}

describe('cds-rule execution coverage', () => {
  const registered = registeredStrategyTypes();
  const rules = loadRules();

  it('loads a non-trivial rule set + a healthy strategy registry', () => {
    expect(rules.length).toBeGreaterThan(700);
    expect(registered.size).toBeGreaterThanOrEqual(70);
  });

  it('has NO dark rules — every rule fires or is documentationOnly', () => {
    const dark = rules.filter((r) => {
      const hasStrategy = r.type != null && registered.has(r.type);
      const hasOutcomes = Array.isArray(r.outcomes) && r.outcomes.length > 0;
      const isDoc = r.documentationOnly === true;
      return !hasStrategy && !hasOutcomes && !isDoc;
    });
    // Surface the offending ids so a future regression is easy to fix.
    expect(dark.map((r) => r.id)).toEqual([]);
  });

  it('does not flag a fireable rule as documentationOnly (mutually exclusive)', () => {
    const mislabelled = rules.filter((r) => {
      if (r.documentationOnly !== true) return false;
      const hasStrategy = r.type != null && registered.has(r.type);
      const hasOutcomes = Array.isArray(r.outcomes) && r.outcomes.length > 0;
      return hasStrategy || hasOutcomes;
    });
    expect(mislabelled.map((r) => r.id)).toEqual([]);
  });

  it('reports the live coverage split (informational)', () => {
    let bespoke = 0;
    let fallback = 0;
    let doc = 0;
    for (const r of rules) {
      const hasStrategy = r.type != null && registered.has(r.type);
      const hasOutcomes = Array.isArray(r.outcomes) && r.outcomes.length > 0;
      if (hasStrategy) bespoke += 1;
      else if (hasOutcomes) fallback += 1;
      else if (r.documentationOnly) doc += 1;
    }
    // At least a few hundred rules should now be live (was 70 before the
    // BundleOutcomeStrategy fallback landed).
    expect(bespoke + fallback).toBeGreaterThanOrEqual(300);
    expect(bespoke + fallback + doc).toBe(rules.length);
  });
});
