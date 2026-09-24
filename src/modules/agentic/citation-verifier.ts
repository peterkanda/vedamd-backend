import type { CitationVerifier } from './card-extractor';
import type { RetrievedKnowledge } from './agentic.types';

/**
 * Accept a citation only if it names a record actually retrieved for this
 * request. Ids are matched in the exact form the prompt hands the model (see
 * buildUserMessage): `drug:<slug>`, `ddi:<slugA>+<slugB>`, `rule:<id>`. Without
 * this the citation requirement proved only that the model emitted a string.
 */
export function buildCitationVerifier(knowledge: RetrievedKnowledge): CitationVerifier {
  const norm = (s: string) => s.trim().toLowerCase();
  const ddi = new Set<string>();
  for (const i of knowledge.interactions) {
    // The model may cite the pair in either order.
    ddi.add(norm(`${i.slugA}+${i.slugB}`));
    ddi.add(norm(`${i.slugB}+${i.slugA}`));
  }
  const known: Record<string, Set<string>> = {
    drug: new Set(knowledge.drugs.map((d) => norm(d.slug))),
    condition: new Set(knowledge.conditions.map((c) => norm(c.slug))),
    procedure: new Set(knowledge.procedures.map((p) => norm(p.slug))),
    rule: new Set(knowledge.rules.map((r) => norm(r.id))),
    ddi,
  };
  return (kind, id) => known[kind]?.has(norm(id)) ?? false;
}
