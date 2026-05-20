import { Injectable, OnModuleInit } from '@nestjs/common';
import { KnowledgeService } from '../knowledge/knowledge.service';
import type {
  CodeSystem,
  ExpandedValueSet,
  LookupResult,
  SearchHit,
  TerminologyBundle,
  TerminologyConcept,
  ValidateCodeResult,
  ValueSet,
} from './terminology.types';

/**
 * FHIR-shaped terminology service backed by the signed content bundle
 * (FR-040–FR-048).
 *
 * Operations:
 *   - `lookup(system, code)`         → FHIR $lookup
 *   - `validateCode(system, code, [display])` → FHIR $validate-code
 *   - `search(query, [systemId])`    → free-text concept search
 *   - `expand(valueSetId)`           → FHIR $expand
 *   - `listSystems()`                → catalogue for the developer portal
 *
 * Systems and value sets are loaded once at startup from
 * `terminology.json` inside the signed bundle. Pure reference data —
 * no PHI ever enters this service.
 */
@Injectable()
export class TerminologyService implements OnModuleInit {
  private bundle: TerminologyBundle = { version: '0.0.0-absent', codeSystems: [], valueSets: [] };
  private bySystemUri = new Map<string, CodeSystem>();
  private bySystemId = new Map<string, CodeSystem>();
  private byValueSetId = new Map<string, ValueSet>();
  /** Pre-built per-system index: code → concept (O(1) lookup). */
  private conceptsBySystem = new Map<string, Map<string, TerminologyConcept>>();

  constructor(private readonly knowledge: KnowledgeService) {}

  onModuleInit(): void {
    this.bundle = this.knowledge.getTerminology();
    for (const cs of this.bundle.codeSystems) {
      this.bySystemUri.set(cs.system, cs);
      this.bySystemId.set(cs.id, cs);
      const idx = new Map<string, TerminologyConcept>();
      for (const c of cs.concepts) idx.set(c.code, c);
      this.conceptsBySystem.set(cs.system, idx);
    }
    for (const vs of this.bundle.valueSets) this.byValueSetId.set(vs.id, vs);
  }

  /** FR-042 $lookup. Accepts system URI (`http://loinc.org`) or short id (`loinc`). */
  lookup(system: string, code: string): LookupResult | null {
    const cs = this.resolveSystem(system);
    if (!cs) return null;
    const concept = this.conceptsBySystem.get(cs.system)?.get(code);
    if (!concept) return null;
    return {
      system: cs.system,
      code: concept.code,
      display: concept.display,
      unit: concept.unit,
      source: cs.title,
    };
  }

  /** FR-042 $validate-code. */
  validateCode(system: string, code: string, display?: string): ValidateCodeResult {
    const cs = this.resolveSystem(system);
    if (!cs) {
      return { result: false, message: `Unknown code system: ${system}` };
    }
    const concept = this.conceptsBySystem.get(cs.system)?.get(code);
    if (!concept) {
      return { result: false, message: `Code ${code} not in ${cs.system}` };
    }
    if (display !== undefined && display.trim().length > 0) {
      const want = display.trim().toLowerCase();
      const have = concept.display.toLowerCase();
      if (!have.includes(want) && !want.includes(have)) {
        return {
          result: false,
          display: concept.display,
          message: `Display mismatch — expected something like "${concept.display}"`,
        };
      }
    }
    return { result: true, display: concept.display };
  }

  /** FR-044 free-text search across concept displays. */
  search(query: string, systemId?: string, limit = 25): SearchHit[] {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const systems: CodeSystem[] = systemId
      ? this.resolveSystem(systemId)
        ? [this.resolveSystem(systemId) as CodeSystem]
        : []
      : this.bundle.codeSystems;

    const hits: SearchHit[] = [];
    for (const cs of systems) {
      for (const c of cs.concepts) {
        const score = scoreMatch(q, c);
        if (score <= 0) continue;
        hits.push({
          system: cs.system,
          systemId: cs.id,
          code: c.code,
          display: c.display,
          score,
        });
      }
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /** FR-042 $expand. */
  expand(valueSetId: string): ExpandedValueSet | null {
    const vs = this.byValueSetId.get(valueSetId);
    if (!vs) return null;
    return {
      id: vs.id,
      title: vs.title,
      system: vs.system,
      concepts: vs.concepts,
      total: vs.concepts.length,
    };
  }

  /** Catalogue of loaded code systems. Useful for the developer portal. */
  listSystems(): Array<
    Pick<CodeSystem, 'system' | 'id' | 'title' | 'publisher' | 'license'> & { conceptCount: number }
  > {
    return this.bundle.codeSystems.map((cs) => ({
      system: cs.system,
      id: cs.id,
      title: cs.title,
      publisher: cs.publisher,
      license: cs.license,
      conceptCount: cs.concepts.length,
    }));
  }

  private resolveSystem(systemOrId: string): CodeSystem | null {
    return this.bySystemUri.get(systemOrId) ?? this.bySystemId.get(systemOrId) ?? null;
  }
}

/**
 * Heuristic match score:
 *   - exact code match → 100
 *   - code prefix      → 60
 *   - display word     → 40
 *   - display substring → 10 + small length-decay bonus
 *   - unit hit         → 10
 */
function scoreMatch(q: string, c: TerminologyConcept): number {
  const code = c.code.toLowerCase();
  const display = c.display.toLowerCase();
  if (code === q) return 100;
  if (code.startsWith(q)) return 60;
  const words = display.split(/[^a-z0-9]+/);
  if (words.includes(q)) return 40;
  if (display.includes(q)) {
    const decay = Math.max(0, 20 - Math.floor(display.length / 20));
    return 10 + decay;
  }
  if (c.unit && c.unit.toLowerCase().includes(q)) return 10;
  return 0;
}
