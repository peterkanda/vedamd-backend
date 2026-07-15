import { describe, expect, it, beforeEach } from 'vitest';
import { KnowledgeRetrieverService } from '../src/modules/agentic/knowledge-retriever.service';
import { extractCards } from '../src/modules/agentic/card-extractor';
import { fhirToContext } from '../src/modules/agentic/fhir/fhir-adapter';
import { assertReadOnly } from '../src/modules/agentic/connectors/sql-connector.types';
import { buildUserMessage } from '../src/modules/agentic/prompts/clinical-reasoner.prompt';
import { SCHEMA_PRESETS, listPresets, getPreset } from '../src/modules/agentic/connectors/schema-presets';
import { makeKnowledgeService } from './helpers/knowledge';

describe('Agentic — knowledge retriever', () => {
  let retriever: KnowledgeRetrieverService;

  beforeEach(() => {
    retriever = new KnowledgeRetrieverService(makeKnowledgeService());
  });

  it('totals all bundle records', () => {
    expect(retriever.totalRecords()).toBeGreaterThan(900);
  });

  it('retrieves DDIs touching a mentioned medication', () => {
    const k = retriever.retrieve({ medications: ['warfarin', 'naproxen'] });
    expect(k.drugs.some((d) => d.slug === 'warfarin')).toBe(true);
    expect(
      k.interactions.some(
        (i) =>
          (i.slugA === 'naproxen' && i.slugB === 'warfarin') ||
          (i.slugA === 'warfarin' && i.slugB === 'naproxen'),
      ),
    ).toBe(true);
  });

  it('retrieves conditions by diagnosis term', () => {
    const k = retriever.retrieve({ diagnoses: ['eclampsia'] });
    expect(k.conditions.some((c) => c.slug === 'eclampsia')).toBe(true);
  });

  it('links a disease-phrased question to the drugs that treat it', () => {
    // No drug is named — only the disease. The retriever must still pull in
    // the antimalarials (with their dosing) via indication linkage so the
    // grounded LLM has something to cite.
    const k = retriever.retrieve({
      question: 'I want to prescribe malaria drugs for a 15 year old 60 kg',
    });
    expect(k.conditions.some((c) => c.slug.includes('malaria'))).toBe(true);
    expect(k.drugs.some((d) => d.slug === 'artemether-lumefantrine')).toBe(true);
  });

  it('still retrieves a drug named explicitly in the free-text question', () => {
    const k = retriever.retrieve({
      question: 'Is it safe to co-prescribe clarithromycin with simvastatin?',
    });
    expect(k.drugs.some((d) => d.slug === 'clarithromycin')).toBe(true);
    expect(k.drugs.some((d) => d.slug === 'simvastatin')).toBe(true);
  });

  it('caps retrieval to bounded sizes', () => {
    const k = retriever.retrieve({ medications: ['a', 'b', 'c'] }, { drugs: 2, ddis: 2, conditions: 2, procedures: 2, rules: 2 });
    expect(k.drugs.length).toBeLessThanOrEqual(2);
    expect(k.interactions.length).toBeLessThanOrEqual(2);
  });
});

describe('Agentic — card extractor', () => {
  const now = new Date().toISOString();

  it('parses well-formed JSON cards with citations', () => {
    const text = JSON.stringify({
      cards: [
        {
          summary: 'Avoid naproxen with warfarin',
          indicator: 'critical',
          detail: 'Bleeding risk.',
          citations: [{ kind: 'ddi', id: 'naproxen+warfarin', label: 'Naproxen + Warfarin' }],
        },
      ],
    });
    const { cards, citedRecords } = extractCards(text, now, 0);
    expect(cards).toHaveLength(1);
    expect(cards[0].indicator).toBe('critical');
    expect(cards[0].extension?.['http://vedamd.io/Card/recommendation'].ruleId).toBe('agentic-reasoner');
    expect(citedRecords[0]).toEqual({ kind: 'ddi', id: 'naproxen+warfarin' });
  });

  it('drops cards with no citation (anti-hallucination guard)', () => {
    const text = JSON.stringify({ cards: [{ summary: 'Some claim', indicator: 'warning', citations: [] }] });
    const { cards } = extractCards(text, now, 0);
    expect(cards).toHaveLength(0);
  });

  it('extracts JSON from prose + code fences', () => {
    const text = 'Here is my analysis:\n```json\n{"cards":[{"summary":"X","indicator":"info","citations":[{"kind":"drug","id":"warfarin","label":"W"}]}]}\n```\nDone.';
    const { cards } = extractCards(text, now, 0);
    expect(cards).toHaveLength(1);
    expect(cards[0].summary).toBe('X');
  });

  it('returns empty on garbage output', () => {
    expect(extractCards('not json at all', now).cards).toHaveLength(0);
  });

  it('applies the 0.6 confidence floor when no minConfidence is passed (G7 anti-hallucination default)', () => {
    // The service calls extractCards WITHOUT a floor for the common case;
    // the default must drop low-confidence cards, not render them.
    const text = JSON.stringify({
      cards: [
        { summary: 'Low', indicator: 'info', confidence: 0.3, citations: [{ kind: 'drug', id: 'x', label: 'X' }] },
        { summary: 'High', indicator: 'warning', confidence: 0.9, citations: [{ kind: 'drug', id: 'y', label: 'Y' }] },
      ],
    });
    const { cards } = extractCards(text, now); // no minConfidence → default 0.6
    expect(cards.map((c) => c.summary)).toEqual(['High']);
  });

  it('parses + clamps confidence into the card extension', () => {
    const text = JSON.stringify({
      cards: [
        { summary: 'A', indicator: 'warning', confidence: 0.92, citations: [{ kind: 'ddi', id: 'a+b', label: 'AB' }] },
        { summary: 'B', indicator: 'info', confidence: 1.7, citations: [{ kind: 'drug', id: 'x', label: 'X' }] },
      ],
    });
    const { cards } = extractCards(text, now, 0);
    expect(cards[0].extension?.['http://vedamd.io/Card/agentic-confidence']).toBeCloseTo(0.92);
    // clamped to 1.0
    expect(cards[1].extension?.['http://vedamd.io/Card/agentic-confidence']).toBe(1);
  });

  it('caps confidence by cited evidence strength (grounded, not self-reported)', () => {
    const text = JSON.stringify({
      cards: [
        // model says 0.95 but the only source is C-tier → capped to 0.7
        { summary: 'weakly-sourced', indicator: 'warning', confidence: 0.95, citations: [{ kind: 'drug', id: 'x', label: 'X' }] },
        // model says 0.95 and an A-tier source backs it → stays high
        { summary: 'well-sourced', indicator: 'warning', confidence: 0.95, citations: [{ kind: 'rule', id: 'y', label: 'Y' }] },
      ],
    });
    const resolve = (_kind: string, id: string) => (id === 'y' ? ('A' as const) : ('C' as const));
    const { cards } = extractCards(text, now, 0, resolve);
    const byId = (s: string) => cards.find((c) => c.summary === s)!;
    expect(byId('weakly-sourced').extension?.['http://vedamd.io/Card/agentic-confidence']).toBeCloseTo(0.7);
    expect(byId('well-sourced').extension?.['http://vedamd.io/Card/agentic-confidence']).toBeCloseTo(0.95);
  });

  it('drops cards below the confidence floor', () => {
    const text = JSON.stringify({
      cards: [
        { summary: 'low', indicator: 'info', confidence: 0.3, citations: [{ kind: 'drug', id: 'x', label: 'X' }] },
        { summary: 'high', indicator: 'critical', confidence: 0.95, citations: [{ kind: 'drug', id: 'y', label: 'Y' }] },
      ],
    });
    const { cards } = extractCards(text, now, 0.6);
    expect(cards).toHaveLength(1);
    expect(cards[0].summary).toBe('high');
  });

  it('applies a default 0.6 confidence floor when none is specified (anti-hallucination)', () => {
    // No minConfidence argument — the caller should get the safe default.
    // The 0.5-default-when-LLM-omits card and the 0.45 card are both
    // below 0.6 → dropped; the 0.92 card is kept.
    const text = JSON.stringify({
      cards: [
        { summary: 'omitted-confidence', indicator: 'info', citations: [{ kind: 'drug', id: 'a', label: 'A' }] },
        { summary: 'just-below', indicator: 'warning', confidence: 0.45, citations: [{ kind: 'drug', id: 'b', label: 'B' }] },
        { summary: 'safe', indicator: 'warning', confidence: 0.92, citations: [{ kind: 'drug', id: 'c', label: 'C' }] },
      ],
    });
    const { cards } = extractCards(text, now);
    expect(cards.map((c) => c.summary)).toEqual(['safe']);
  });

  it('agentic cards carry reviewStatus="review" so the UI flags LLM provenance', () => {
    const text = JSON.stringify({
      cards: [{ summary: 'A', indicator: 'warning', confidence: 0.9, citations: [{ kind: 'drug', id: 'x', label: 'X' }] }],
    });
    const { cards } = extractCards(text, now, 0);
    expect(cards[0].extension?.['http://vedamd.io/Card/recommendation'].reviewStatus).toBe('review');
  });

  it('defaults confidence to 0.5 when the model omits it', () => {
    const text = JSON.stringify({ cards: [{ summary: 'A', indicator: 'info', citations: [{ kind: 'drug', id: 'x', label: 'X' }] }] });
    const { cards } = extractCards(text, now, 0);
    expect(cards[0].extension?.['http://vedamd.io/Card/agentic-confidence']).toBe(0.5);
  });

  it('parses a structured suggestion into CDS Hooks suggestions', () => {
    const text = JSON.stringify({
      cards: [
        {
          summary: 'Avoid naproxen with warfarin',
          indicator: 'critical',
          confidence: 0.95,
          citations: [{ kind: 'ddi', id: 'naproxen+warfarin', label: 'NW' }],
          suggestion: {
            label: 'Replace naproxen with paracetamol',
            actions: [
              { type: 'remove', description: 'Stop naproxen' },
              { type: 'add', description: 'Paracetamol 1g QDS' },
            ],
          },
        },
      ],
    });
    const { cards } = extractCards(text, now, 0);
    const sugg = (cards[0].suggestions ?? []) as Array<{ label: string; actions: unknown[] }>;
    expect(sugg).toHaveLength(1);
    expect(sugg[0].label).toBe('Replace naproxen with paracetamol');
    expect(sugg[0].actions).toHaveLength(2);
  });

  it('drops a suggestion with no valid actions', () => {
    const text = JSON.stringify({
      cards: [
        {
          summary: 'X',
          indicator: 'warning',
          confidence: 0.8,
          citations: [{ kind: 'drug', id: 'x', label: 'X' }],
          suggestion: { label: 'Do something', actions: [] },
        },
      ],
    });
    const { cards } = extractCards(text, now, 0);
    expect(cards[0].suggestions).toBeUndefined();
  });

  it('sorts cards critical → warning → info', () => {
    const text = JSON.stringify({
      cards: [
        { summary: 'i', indicator: 'info', citations: [{ kind: 'drug', id: 'x', label: 'x' }] },
        { summary: 'c', indicator: 'critical', citations: [{ kind: 'drug', id: 'y', label: 'y' }] },
        { summary: 'w', indicator: 'warning', citations: [{ kind: 'drug', id: 'z', label: 'z' }] },
      ],
    });
    const { cards } = extractCards(text, now, 0);
    expect(cards.map((c) => c.indicator)).toEqual(['critical', 'warning', 'info']);
  });
});

describe('Agentic — FHIR R4 adapter', () => {
  it('extracts meds, conditions, allergies, labs from a Bundle', () => {
    const bundle = {
      resourceType: 'Bundle',
      entry: [
        { resource: { resourceType: 'Patient', gender: 'female', birthDate: '1990-01-01' } },
        { resource: { resourceType: 'MedicationRequest', medicationCodeableConcept: { text: 'warfarin' } } },
        { resource: { resourceType: 'Condition', code: { text: 'atrial fibrillation' } } },
        { resource: { resourceType: 'AllergyIntolerance', code: { text: 'penicillin' } } },
        { resource: { resourceType: 'Observation', code: { text: 'INR', coding: [{ system: 'http://loinc.org', code: '6301-6' }] }, valueQuantity: { value: 3.5 } } },
      ],
    };
    const ctx = fhirToContext(bundle, 'medication-prescribe');
    expect(ctx.patient?.sex).toBe('female');
    expect(ctx.patient?.ageYears).toBeGreaterThan(30);
    expect(ctx.medications).toContain('warfarin');
    expect(ctx.diagnoses).toContain('atrial fibrillation');
    expect(ctx.allergies).toContain('penicillin');
    expect(ctx.labs?.[0]).toMatchObject({ name: 'INR', value: 3.5, code: '6301-6' });
  });

  it('handles a single resource (not a bundle)', () => {
    const ctx = fhirToContext({ resourceType: 'MedicationStatement', medicationCodeableConcept: { coding: [{ display: 'metformin' }] } });
    expect(ctx.medications).toContain('metformin');
  });

  it('does not extract patient identifiers', () => {
    const ctx = fhirToContext({ resourceType: 'Patient', name: [{ family: 'Smith' }], identifier: [{ value: 'MRN123' }], gender: 'male' });
    const serialized = JSON.stringify(ctx).toLowerCase();
    expect(serialized.includes('smith')).toBe(false);
    expect(serialized.includes('mrn123')).toBe(false);
  });
});

describe('Agentic — SQL read-only guard', () => {
  it('allows SELECT', () => {
    expect(() => assertReadOnly('SELECT * FROM patients WHERE id = :id')).not.toThrow();
  });
  it('allows WITH CTE', () => {
    expect(() => assertReadOnly('WITH x AS (SELECT 1) SELECT * FROM x')).not.toThrow();
  });
  it('rejects INSERT', () => {
    expect(() => assertReadOnly('INSERT INTO patients VALUES (1)')).toThrow();
  });
  it('rejects UPDATE / DELETE / DROP', () => {
    expect(() => assertReadOnly('UPDATE patients SET x=1')).toThrow();
    expect(() => assertReadOnly('DELETE FROM patients')).toThrow();
    expect(() => assertReadOnly('DROP TABLE patients')).toThrow();
  });
  it('rejects stacked statements', () => {
    expect(() => assertReadOnly('SELECT 1; DROP TABLE patients;')).toThrow();
  });
  it('rejects stored-procedure calls', () => {
    expect(() => assertReadOnly('EXEC sp_who')).toThrow();
  });
});

describe('Agentic — EHR schema presets', () => {
  it('ships presets for the major EHR/HMIS platforms', () => {
    const platforms = new Set(SCHEMA_PRESETS.map((p) => p.platform));
    expect(platforms.has('openmrs')).toBe(true);
    expect(platforms.has('openemr')).toBe(true);
    expect(platforms.has('dhis2-tracker')).toBe(true);
    expect(platforms.has('fhir-sql')).toBe(true);
  });

  it('every preset query is read-only + parameterised', () => {
    for (const p of SCHEMA_PRESETS) {
      expect(() => assertReadOnly(p.query.sql)).not.toThrow();
      expect(p.query.sql).toMatch(/:[a-zA-Z]/); // has a bound parameter
    }
  });

  it('no preset selects patient identifiers', () => {
    for (const p of SCHEMA_PRESETS) {
      const sql = p.query.sql.toLowerCase();
      expect(sql.includes('mrn')).toBe(false);
      // family/given name columns must not be selected
      expect(/\bselect\b[\s\S]*\b(family_name|given_name|patient_name)\b/.test(sql)).toBe(false);
    }
  });

  it('filters presets by platform', () => {
    expect(listPresets('openmrs').every((p) => p.platform === 'openmrs')).toBe(true);
    expect(getPreset('openmrs.active-meds')?.id).toBe('openmrs.active-meds');
    expect(getPreset('openmrs.active-meds')?.query.mapping.medicationColumn).toBe('med');
  });
});

describe('Agentic — batch evaluation', () => {
  it('isolates per-item errors + rolls up indicators', async () => {
    // Bind the real batch orchestration to a stub `evaluate` so we test
    // concurrency + per-item isolation + roll-up without an LLM key.
    const { AgenticService } = await import('../src/modules/agentic/agentic.service');
    const stub = {
      async evaluate(ctx: { medications?: string[] }) {
        if (ctx.medications?.includes('THROW')) throw new Error('boom');
        const critical = ctx.medications?.includes('warfarin');
        return {
          cards: critical
            ? [{ summary: 'x', indicator: 'critical', source: { label: 's' } }]
            : [{ summary: 'y', indicator: 'info', source: { label: 's' } }],
          meta: {},
        };
      },
      log: { info: () => undefined, warn: () => undefined },
    } as unknown as InstanceType<typeof AgenticService>;
    const batch = AgenticService.prototype.evaluateBatch.bind(stub);

    const res = await batch(
      [
        { id: 'a', medications: ['warfarin'] },
        { id: 'b', medications: ['paracetamol'] },
        { id: 'c', medications: ['THROW'] },
      ],
      2,
    );

    expect(res.results).toHaveLength(3);
    expect(res.results[0]).toMatchObject({ id: 'a', ok: true });
    expect(res.results[2]).toMatchObject({ id: 'c', ok: false });
    expect(res.summary.evaluated).toBe(2);
    expect(res.summary.errored).toBe(1);
    expect(res.summary.critical).toBe(1);
    expect(res.summary.info).toBe(1);
  });
});

describe('Agentic — prompt builder', () => {
  it('embeds knowledge + context + task and never invents structure', () => {
    const msg = buildUserMessage(
      { medications: ['warfarin'], diagnoses: ['af'], patient: { ageYears: 70, sex: 'male' }, question: 'safe to add naproxen?' },
      {
        drugs: [{ slug: 'warfarin', inn: 'Warfarin', summary: 'class=anticoagulant' }],
        interactions: [{ slugA: 'naproxen', slugB: 'warfarin', severity: 'major', mechanism: 'bleeding', management: 'avoid' }],
        conditions: [],
        procedures: [],
        rules: [],
      },
    );
    expect(msg).toContain('VEDAMD KNOWLEDGE');
    expect(msg).toContain('[ddi:naproxen+warfarin]');
    expect(msg).toContain('PATIENT CONTEXT');
    expect(msg).toContain('safe to add naproxen?');
  });
});
