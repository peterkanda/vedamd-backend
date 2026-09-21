import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { KnowledgeSearchService } from '../src/modules/knowledge/knowledge-search.service';
import { makeKnowledgeService } from './helpers/knowledge';

/**
 * Every clinical domain in the signed bundle must be reachable from chat,
 * or be listed here with a reason.
 *
 * This is the guard the drug-interactions / renal-dose gap needed. Those two
 * files sat in the bundle, loaded, counted in `totalRecords()` and served by
 * their own endpoints, while `KnowledgeSearchService` — the corpus the
 * assistant grounds on — simply did not list them. 678 curated records were
 * unreachable from chat and nothing failed, because no test related the
 * bundle's contents to what chat can actually search.
 *
 * Naming differs slightly between the bundle file and the search domain
 * (`immunization-schedule` vs `immunization`), so the map is explicit.
 */
const FILE_TO_DOMAIN: Record<string, string> = {
  'allergy-cross-reactivity.json': 'allergy-cross-reactivity',
  'anticoagulant-reversal.json': 'anticoagulant-reversal',
  'antidotes.json': 'antidotes',
  'bedside-interpretation.json': 'bedside-interpretation',
  'clinical-procedures.json': 'clinical-procedures',
  'clinical-scores.json': 'clinical-scores',
  'conditions.json': 'conditions',
  'drug-disease-interactions.json': 'drug-disease',
  'drug-interactions.json': 'drug-interactions',
  'drugs.json': 'drugs',
  'growth-development.json': 'growth-development',
  'hepatic-dose.json': 'hepatic-dose',
  'immunization-schedule.json': 'immunization',
  'iv-compatibility.json': 'iv-compatibility',
  'notifiable-diseases.json': 'notifiable-diseases',
  'pharmacogenomics.json': 'pharmacogenomics',
  'pregnancy-lactation.json': 'pregnancy-lactation',
  'preventive-care.json': 'preventive-care',
  'procedures.json': 'procedures',
  'reference-ranges.json': 'reference-ranges',
  'renal-dose.json': 'renal-dose',
  'symptom-triage.json': 'symptom-triage',
  'toxidromes.json': 'toxidromes',
};

/** Bundle files that are deliberately NOT a chat-searchable domain. */
const NOT_SEARCHABLE: Record<string, string> = {
  'cds-rules.json':
    'Executable rules evaluated against a patient context by the CDS engine, not records a clinician looks up by name.',
  'terminology.json':
    'Code systems and value sets — infrastructure for coding, with no clinical prose to ground an answer on.',
  'manifest.json': 'Bundle metadata.',
  'public-key.pem': 'Bundle signing key.',
  'manifest.sig': 'Bundle signature.',
};

const BUNDLE_DIR = path.join(__dirname, '..', 'content', 'bundles', 'v0.1.0');

describe('chat corpus covers the bundle', () => {
  /**
   * Which domains the search service actually serves. There is no public
   * accessor for the spec list, so probe with common letter fragments —
   * every domain holds records whose title contains at least one of them.
   */
  const svc = new KnowledgeSearchService(makeKnowledgeService());
  const reachable = new Set<string>();
  for (const term of ['a', 'e', 'i', 'o', 'in', 'an', 'th', 'ic', 'al', 'on', 'ne', 'ra']) {
    for (const hit of svc.search(term, 500)) reachable.add(hit.domain);
  }

  it('accounts for every file in the bundle', () => {
    const unaccounted = fs
      .readdirSync(BUNDLE_DIR)
      .filter((f) => !(f in FILE_TO_DOMAIN) && !(f in NOT_SEARCHABLE));
    expect(
      unaccounted,
      'A new bundle file must be added to FILE_TO_DOMAIN and wired into ' +
        'KnowledgeSearchService, or to NOT_SEARCHABLE with a reason. Leaving ' +
        'it out silently makes its records invisible to chat.',
    ).toEqual([]);
  });

  it('makes every clinical domain reachable from chat grounding', () => {
    const missing = Object.entries(FILE_TO_DOMAIN)
      .filter(([, domain]) => !reachable.has(domain))
      .map(([file, domain]) => `${file} -> '${domain}'`);
    expect(
      missing,
      'These domains are loaded and served by their own endpoints, but the ' +
        'assistant cannot ground an answer on them.',
    ).toEqual([]);
  });

  it('keeps the two domains this guard was written for reachable', () => {
    expect(reachable.has('drug-interactions')).toBe(true);
    expect(reachable.has('renal-dose')).toBe(true);
  });
});
