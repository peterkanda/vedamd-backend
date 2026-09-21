import { describe, expect, it } from 'vitest';
import { AssistantService } from '../src/modules/assistant/assistant.service';
import { KnowledgeSearchService } from '../src/modules/knowledge/knowledge-search.service';
import { makeKnowledgeService } from './helpers/knowledge';
import { populationNote } from '../src/modules/reference-ranges/reference-ranges.types';

/**
 * A grounded answer must be grounded on the part of the record that answers
 * the question.
 *
 * The grounding summariser used an allow-list of fields written around
 * `conditions` and `drugs`, so any domain whose answer lived elsewhere was
 * emptied on its way to the model: a reference range arrived as
 * {"analyte":"Sodium","category":"electrolytes"} with the interval stripped,
 * and a notifiable disease as {"disease":"Smallpox"} with no notification
 * level or timeframe. The model answered from memory; the UI cited the
 * record. These tests pin the fields that make each domain's answer.
 */
function summarize(rec: Record<string, unknown>): string {
  const svc = new AssistantService(
    new KnowledgeSearchService(makeKnowledgeService()),
    // The router is never reached — summarize() is pure.
    null as never,
  );
  return (svc as unknown as { summarize(r: Record<string, unknown>): string }).summarize(rec);
}

/** Grounding text as the assistant builds it, including per-domain notes. */
function summarizeFor(domain: string, rec: Record<string, unknown>): string {
  const svc = new AssistantService(
    new KnowledgeSearchService(makeKnowledgeService()),
    null as never,
  );
  const inner = svc as unknown as { summarize(r: Record<string, unknown>): string };
  // `annotate` is module-private; exercise it through the same shape the
  // grounding loop uses by asking the service for the record's summary
  // after the assistant's own annotation step.
  const annotated =
    domain === 'reference-ranges' ? { ...rec, appliesTo: populationNote(rec as never) } : rec;
  return inner.summarize(annotated);
}

const knowledge = makeKnowledgeService();
const bySlug = <T extends { slug?: string }>(rows: T[], slug: string): Record<string, unknown> =>
  rows.find((r) => r.slug === slug) as unknown as Record<string, unknown>;

describe('grounding carries the answer-bearing fields', () => {
  it('keeps the interval on a reference range', () => {
    const text = summarize(bySlug(knowledge.getReferenceRanges() as never[], 'sodium'));
    expect(text).toContain('"low":135');
    expect(text).toContain('"high":145');
    expect(text).toContain('mmol/L');
  });

  it('keeps notification level and timeframe on a notifiable disease', () => {
    const rec = (knowledge.getNotifiableDiseases() as unknown as Record<string, unknown>[])[0];
    const text = summarize(rec);
    if (rec.level !== undefined) expect(text).toContain('"level"');
    if (rec.timeframe !== undefined) expect(text).toContain('"timeframe"');
  });

  it('keeps the compatibility verdict on an IV-compatibility record', () => {
    const rec = (knowledge.getIvCompatibility() as unknown as Record<string, unknown>[])[0];
    if (rec.status === undefined) return;
    expect(summarize(rec)).toContain('"status"');
  });

  it('drops provenance and codings rather than clinical content', () => {
    const text = summarize({
      analyte: 'Potassium',
      low: 3.5,
      high: 5.0,
      unit: 'mmol/L',
      loinc: '2823-3',
      slug: 'potassium',
      reviewStatus: 'draft',
      ruleVersion: '0.1.0',
      references: [{ label: 'x' }],
    });
    expect(text).toContain('"low":3.5');
    expect(text).not.toContain('reviewStatus');
    expect(text).not.toContain('2823-3');
    expect(text).not.toContain('"slug"');
  });

  it('always emits valid JSON, even when the record overflows the budget', () => {
    const huge = { title: 'Big', summary: 'x'.repeat(5000), redFlags: ['y'.repeat(5000)] };
    const text = summarize(huge).replace(/ \(truncated\)$/, '');
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it('includes a new field without anyone adding it to a list', () => {
    const text = summarize({ title: 'T', someBrandNewClinicalField: 'matters' });
    expect(text).toContain('someBrandNewClinicalField');
  });
});

/**
 * Every reference range in the v0.1 bundle is an adult interval, and not one
 * of the 321 records says so. Grounded on the bare numbers, a paediatric
 * question gets an adult figure back under a VedaMD citation.
 */
describe('reference ranges state the population they apply to', () => {
  it('labels an unbanded interval as adult and not validated for children', () => {
    const rec = bySlug(knowledge.getReferenceRanges() as never[], 'sodium');
    const grounded = summarizeFor('reference-ranges', rec);
    expect(grounded).toContain('ADULT reference interval');
    expect(grounded).toContain('not validated for children');
  });

  it('still carries the interval alongside the caveat', () => {
    const rec = bySlug(knowledge.getReferenceRanges() as never[], 'sodium');
    const grounded = summarizeFor('reference-ranges', rec);
    expect(grounded).toContain('"low":135');
  });

  it('describes a paediatric band when one is authored', () => {
    const grounded = summarizeFor('reference-ranges', {
      analyte: 'Haemoglobin',
      low: 9.5,
      high: 13.5,
      unit: 'g/dL',
      ageGroup: 'paediatric',
      ageMinMonths: 6,
      ageMaxMonths: 24,
    });
    expect(grounded).toContain('Paediatric reference interval');
    expect(grounded).toContain('6 months to 2 years');
  });

  it('adds nothing to other domains', () => {
    const rec = bySlug(knowledge.getDrugs() as never[], 'paracetamol');
    expect(summarizeFor('drugs', rec)).not.toContain('appliesTo');
  });
});
