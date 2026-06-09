#!/usr/bin/env node
/**
 * Activate the hepatic-safety CDS rule.
 *
 * The HepaticSafetyStrategy + wiring + tests ship in the repo, but the rule
 * that *fires* it must live in the signed content bundle (cds-rules.json).
 * That file is integrity-protected by manifest.json/manifest.sig, so it can
 * only be changed in an environment that holds the signing private key
 * (dev-keys/private-key.pem) — which is intentionally not committed.
 *
 * Run this where the key is available:
 *
 *   node scripts/activate-hepatic-safety-rule.mjs
 *   npm run bundle:sign -- --allow-draft          # re-sign manifest + .sig
 *   npm run bundle:verify -- --bundle content/bundles/v0.1.0
 *
 * The insert is idempotent — running it twice is a no-op.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const RULES = resolve(process.cwd(), 'content/bundles/v0.1.0/cds-rules.json');

const RULE = {
  id: 'hepatic-safety',
  hook: 'medication-prescribe',
  type: 'hepatic-safety',
  title: 'Hepatic-function safety check on prescribing',
  description:
    'When the caller signals liver impairment (context.childPughClass A|B|C, an acute-liver-failure flag, or a cirrhosis/liverDisease boolean) and supplies proposed/current medications, surface the structured Child-Pugh dose guidance from each drug’s hepatic-dose record. Mirrors the renal-safety axis for the liver.',
  references: [
    { label: 'WHO Model Formulary — prescribing in hepatic impairment', strength: 'A' },
    {
      label: 'Lewis JH, Stine JG. Prescribing medications in patients with cirrhosis. Aliment Pharmacol Ther 2013.',
      strength: 'B',
    },
  ],
  ruleVersion: '0.1.0-placeholder',
  reviewStatus: 'draft',
  evidenceLevel: 'expert-consensus',
  codings: [
    { system: 'http://hl7.org/fhir/sid/icd-10', code: 'K74', display: 'Fibrosis and cirrhosis of liver', kind: 'diagnosis' },
    { system: 'http://hl7.org/fhir/sid/icd-10', code: 'K72', display: 'Hepatic failure, not elsewhere classified', kind: 'diagnosis' },
    { system: 'http://snomed.info/sct', code: '19943007', display: 'Cirrhosis of liver (disorder)', kind: 'diagnosis' },
  ],
};

const rules = JSON.parse(readFileSync(RULES, 'utf8'));
if (!Array.isArray(rules)) throw new Error('cds-rules.json is not an array');

if (rules.some((r) => r.type === 'hepatic-safety' || r.id === 'hepatic-safety')) {
  console.log('hepatic-safety rule already present — nothing to do.');
  process.exit(0);
}

// Insert next to the renal-safety rule for locality; fall back to the end.
const renalIdx = rules.findIndex((r) => r.type === 'renal-safety');
const at = renalIdx === -1 ? rules.length : renalIdx + 1;
rules.splice(at, 0, RULE);

writeFileSync(RULES, JSON.stringify(rules, null, 2) + '\n');
console.log(`Inserted hepatic-safety rule at index ${at}. Now run:`);
console.log('  npm run bundle:sign -- --allow-draft');
console.log('  npm run bundle:verify -- --bundle content/bundles/v0.1.0');
