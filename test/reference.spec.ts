import { describe, expect, it, beforeEach } from 'vitest';
import { ReferenceService } from '../src/modules/reference/reference.service';
import { ReferenceDoseService } from '../src/modules/reference/reference-dose.service';
import { ReferenceDiagramService } from '../src/modules/reference/reference-diagram.service';
import { extractCitations } from '../src/modules/reference/reference-chat.service';
import { DrugsService } from '../src/modules/drugs/drugs.service';
import { makeKnowledgeService } from './helpers/knowledge';

describe('Reference — organisation/browse', () => {
  let ref: ReferenceService;
  beforeEach(() => {
    ref = new ReferenceService(makeKnowledgeService());
  });

  it('summary returns content counts', () => {
    const s = ref.summary();
    expect(s.drugs).toBeGreaterThan(300);
    expect(s.conditions).toBeGreaterThan(200);
    expect(s.procedures).toBeGreaterThan(60);
    expect(s.interactions).toBeGreaterThan(200);
  });

  it('alphabetical index is sorted + grouped by first letter', () => {
    const groups = ref.alphabetical(['drug']);
    expect(groups.length).toBeGreaterThan(5);
    const letters = groups.map((g) => g.letter);
    expect([...letters]).toEqual([...letters].sort());
    // each group sorted internally
    for (const g of groups) {
      const titles = g.items.map((i) => i.title);
      expect(titles).toEqual([...titles].sort((a, b) => a.localeCompare(b)));
    }
  });

  it('groups drugs by AWaRe category', () => {
    const groups = ref.grouped('drug', 'aware');
    const names = groups.map((g) => g.group);
    expect(names.some((n) => n.includes('Watch') || n.includes('Access') || n.includes('Reserve'))).toBe(true);
  });

  it('groups conditions by clinical domain (multi-membership)', () => {
    const groups = ref.grouped('condition', 'specialty');
    expect(groups.length).toBeGreaterThan(10);
    // total membership >= number of conditions (conditions can be in multiple domains)
    const totalMembership = groups.reduce((acc, g) => acc + g.count, 0);
    expect(totalMembership).toBeGreaterThan(200);
  });

  it('search ranks exact slug highest', () => {
    const results = ref.search('warfarin');
    expect(results[0].slug).toBe('warfarin');
  });

  it('search returns empty for blank query', () => {
    expect(ref.search('')).toHaveLength(0);
  });
});

describe('Reference — dose calculator', () => {
  let dose: ReferenceDoseService;
  beforeEach(() => {
    const knowledge = makeKnowledgeService();
    const drugs = new DrugsService(knowledge);
    drugs.onModuleInit();
    dose = new ReferenceDoseService(drugs, knowledge);
  });

  it('refuses + cites when weight is missing', () => {
    const r = dose.calculate({ slug: 'amoxicillin' });
    expect(r).not.toBeNull();
    expect(r!.computed).toBe(false);
    expect(r!.refusedReason).toMatch(/weight is required/i);
    expect(r!.referenceDosing).toBeTruthy();
  });

  it('returns null for unknown drug', () => {
    expect(dose.calculate({ slug: 'not-a-drug', weightKg: 20 })).toBeNull();
  });

  it('shows reference text (no calc) for free-text-dosing drugs', () => {
    // a G-phase drug with free-text doseSchedule (no structured mg/kg)
    const r = dose.calculate({ slug: 'tld-fdc', weightKg: 60, ageYears: 30 });
    expect(r).not.toBeNull();
    // either computed=false with reference text, or a narrative — never a fabricated number
    expect(r!.referenceDosing).toBeTruthy();
  });
});

describe('Reference — deterministic diagrams', () => {
  let diag: ReferenceDiagramService;
  beforeEach(() => {
    diag = new ReferenceDiagramService(makeKnowledgeService());
  });

  it('builds a Mermaid flowchart for a condition with red-flag escalation', () => {
    const d = diag.conditionFlowchart('eclampsia');
    expect(d).not.toBeNull();
    expect(d!.format).toBe('mermaid');
    expect(d!.diagram).toContain('flowchart TD');
    expect(d!.diagram).toMatch(/ESCALATE|red flag/i);
  });

  it('procedure flowchart highlights safety-check gates', () => {
    const d = diag.procedureFlowchart('shoulder-dystocia-management');
    expect(d).not.toBeNull();
    expect(d!.diagram).toContain('SAFETY CHECK');
  });

  it('returns null for unknown slug', () => {
    expect(diag.conditionFlowchart('nope')).toBeNull();
  });

  it('builds a drug-interaction network for a med list with severity-coded edges', () => {
    const net = diag.interactionNetwork(['warfarin', 'naproxen', 'paracetamol']);
    expect(net.format).toBe('mermaid');
    expect(net.diagram).toContain('graph TD');
    // warfarin+naproxen is a known major interaction → at least one edge + severeCount >= 1
    expect(net.interactions.length).toBeGreaterThanOrEqual(1);
    expect(net.severeCount).toBeGreaterThanOrEqual(1);
    expect(net.diagram).toMatch(/linkStyle/);
  });

  it('interaction network reports none cleanly when no interactions', () => {
    const net = diag.interactionNetwork(['paracetamol', 'cetirizine']);
    expect(net.interactions.length).toBe(0);
    expect(net.diagram).toMatch(/No known interactions/);
  });

  it('single-drug interaction map radiates partners', () => {
    const map = diag.drugInteractionMap('warfarin');
    expect(map).not.toBeNull();
    expect(map!.diagram).toContain('graph LR');
    expect(map!.partners.length).toBeGreaterThan(0);
  });

  it('drug interaction map returns null for unknown drug', () => {
    expect(diag.drugInteractionMap('not-a-drug')).toBeNull();
  });
});

describe('Reference — chat citation extraction', () => {
  it('extracts + dedupes [kind:id] citations from answer text', () => {
    const text =
      'VedaMD lists a major interaction [ddi:warfarin+naproxen]. Use paracetamol [drug:paracetamol] instead [drug:paracetamol]. See eclampsia [condition:eclampsia].';
    const cites = extractCitations(text);
    expect(cites).toContainEqual({ kind: 'ddi', id: 'warfarin+naproxen' });
    expect(cites).toContainEqual({ kind: 'drug', id: 'paracetamol' });
    expect(cites).toContainEqual({ kind: 'condition', id: 'eclampsia' });
    // dedupe paracetamol
    expect(cites.filter((c) => c.id === 'paracetamol')).toHaveLength(1);
  });

  it('returns empty when no citations present', () => {
    expect(extractCitations('no tags here')).toHaveLength(0);
  });
});
