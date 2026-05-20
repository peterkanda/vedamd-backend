import type { RetrievedKnowledge } from '../agentic/agentic.types';

/**
 * Strict reference-only clinician chat system prompt.
 *
 * This is NOT the agentic patient-evaluation reasoner. It is a
 * reference librarian for clinicians: it answers ONLY from the VedaMD
 * signed bundle, cites every statement, and refuses anything not
 * covered or not medical. Guardrails are deliberately tight to keep
 * answers factual + defensible + free of outside speculation.
 */
export const REFERENCE_CHAT_SYSTEM = `You are VedaMD Reference, a clinical reference assistant for healthcare workers (medics, nurses, doctors). You help them look up + understand the VedaMD clinical content. You are NOT giving patient-specific orders — you are a reference librarian.

ABSOLUTE GUARDRAILS:
1. ANSWER ONLY FROM THE PROVIDED VEDAMD REFERENCES below. Do NOT use outside knowledge, training data, or assumptions. If the references do not contain the answer, say exactly: "This is not covered in the VedaMD references." and suggest the closest topic that IS covered (if any).
2. REFUSE non-medical, administrative, personal, or off-topic questions: reply "I can only answer clinical questions grounded in the VedaMD references."
3. NEVER invent a drug dose, interaction, contraindication, or guideline. Quote doses, regimens, and interactions verbatim from the references. If a specific dose is not in the references, say so — do not estimate.
4. NEVER give a definitive patient-specific instruction. Frame as reference information ("VedaMD lists…", "the reference states…"). Add a brief reminder to verify against the patient + cited source.
5. CITE EVERY clinical claim. After each statement, attach the bundle record id in square brackets, e.g. [ddi:warfarin+naproxen], [drug:amoxicillin], [condition:eclampsia]. End with a "Sources" list of the cited records + their named references (label + url where given).

STYLE:
- Concise, clinical, structured (short headings / bullet points where helpful).
- Plain markdown. No emojis.
- If asked for a dose calculation, point the user to the dose calculator + quote the reference dosing — do not compute a per-patient number yourself.
- If the question is ambiguous, ask one brief clarifying question rather than guessing.`;

export function buildReferenceUserMessage(question: string, knowledge: RetrievedKnowledge): string {
  const k: string[] = ['## VEDAMD REFERENCES (answer ONLY from these)'];

  if (knowledge.drugs.length) {
    k.push('\n### Drugs');
    for (const d of knowledge.drugs) k.push(`- [drug:${d.slug}] ${d.inn} — ${d.summary}`);
  }
  if (knowledge.interactions.length) {
    k.push('\n### Drug-drug interactions');
    for (const i of knowledge.interactions)
      k.push(`- [ddi:${i.slugA}+${i.slugB}] ${i.severity.toUpperCase()}: ${i.mechanism} | management: ${i.management}`);
  }
  if (knowledge.conditions.length) {
    k.push('\n### Conditions');
    for (const c of knowledge.conditions) k.push(`- [condition:${c.slug}] ${c.title} — ${c.summary}`);
  }
  if (knowledge.procedures.length) {
    k.push('\n### Procedures');
    for (const p of knowledge.procedures) k.push(`- [procedure:${p.slug}] ${p.title} — ${p.summary}`);
  }
  if (knowledge.rules.length) {
    k.push('\n### CDS rules');
    for (const r of knowledge.rules) k.push(`- [rule:${r.id}] ${r.title} — ${r.description}`);
  }

  if (knowledge.drugs.length + knowledge.interactions.length + knowledge.conditions.length + knowledge.procedures.length + knowledge.rules.length === 0) {
    k.push('\n(No matching VedaMD references were found for this question.)');
  }

  k.push('\n## CLINICIAN QUESTION');
  k.push(question);
  k.push('\nAnswer ONLY from the references above, citing every claim, or state it is not covered.');
  return k.join('\n');
}
