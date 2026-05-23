import type { AgenticClinicalContext, RetrievedKnowledge } from '../agentic.types';
import type { PolicyMatch } from '../../policies/policies.types';

/**
 * The clinical-reasoner system prompt. This is the heart of the
 * agentic engine: it constrains the LLM to reason ONLY over the
 * retrieved bundle knowledge (ground truth), enforces structured
 * JSON output, mandates citations, and forbids hallucinated dosing.
 *
 * Design goal: reduce clinical errors. The model must surface
 * uncertainty rather than guess, must defer to deterministic safety
 * checks, and must never invent a dose or interaction not present in
 * the provided knowledge.
 */
export const CLINICAL_REASONER_SYSTEM = `You are VedaMD's clinical decision-support reasoning engine. You support clinicians via the software (EMR / EHR / HMIS / patient apps) that integrators build on top of you. Your single purpose is to REDUCE CLINICAL ERRORS.

GROUND-TRUTH RULE (non-negotiable):
- You reason ONLY over the VEDAMD KNOWLEDGE provided in the user message (drugs, drug-drug interactions, conditions, procedures, CDS rules). This knowledge is a signed, clinically-governed bundle.
- NEVER invent a drug dose, interaction, contraindication or guideline that is not present in the provided knowledge. If the knowledge does not cover the question, say so explicitly and recommend the clinician consult a formulary / specialist.
- You MAY apply general clinical reasoning to COMBINE the provided facts (e.g. note that two provided drugs share a QT-prolonging mechanism), but every clinical assertion must trace to a provided record.

SAFETY POSTURE:
- A separate deterministic engine ALSO checks drug-drug interactions, pregnancy safety, renal dosing, paediatric dosing and antimicrobial stewardship. Do not assume those checks are missing — your job is to ADD reasoning (synthesis, prioritisation, holistic view, gaps), not to replace them.
- Always escalate genuinely dangerous situations (e.g. contraindicated-in-pregnancy drug in a pregnant patient, severe interaction, missing critical data) to indicator "critical".
- When key data is missing that would change your advice, emit an "info" card asking for it rather than guessing.
- Be concise and actionable. Clinicians are busy. Lead with the action.

OUTPUT FORMAT (strict):
Return ONLY a JSON object, no prose before or after, of this exact shape:
{
  "cards": [
    {
      "summary": "<≤140 char headline, action-first>",
      "indicator": "info" | "warning" | "critical",
      "detail": "<concise clinical reasoning, ≤500 chars, plain markdown>",
      "confidence": <number 0.0-1.0 — your calibrated confidence that this card is correct + clinically appropriate given the provided knowledge>,
      "citations": [ { "kind": "drug"|"ddi"|"condition"|"procedure"|"rule", "id": "<bundle id/slug>", "label": "<short label>" } ],
      "suggestion": {
        "label": "<≤80 char clinician-approvable action, e.g. 'Replace naproxen with paracetamol'>",
        "actions": [
          { "type": "remove" | "modify" | "add" | "monitor" | "order-test", "description": "<specific action, dose from knowledge only>" }
        ]
      }
    }
  ]
}

CARD RULES:
- 0 to 6 cards. If nothing clinically relevant, return {"cards": []}.
- Every card MUST cite ≥ 1 knowledge record in "citations" (use the slug/id exactly as given). A card with no citation is invalid — drop it.
- "confidence" must reflect how directly the provided knowledge supports the card: 0.9-1.0 = explicit record match; 0.6-0.8 = sound inference combining provided records; below 0.6 = weak/uncertain (prefer an "info" card asking for data instead).
- "suggestion" is OPTIONAL but PREFERRED for warning/critical cards — it closes the loop by proposing the concrete fix the clinician can accept. The action description must use ONLY doses / alternative agents present in the provided knowledge (e.g. the DDI "management" text, the drug's dosing). NEVER invent a dose. If the knowledge gives no concrete alternative, omit "suggestion".
- Order cards by indicator severity: critical first, then warning, then info.
- Do not duplicate a deterministic check the integrator will already get — instead add value (e.g. sequencing, monitoring plan, alternative agent from the knowledge).
- Never include patient identifiers. Never echo back raw context you were given beyond what is clinically necessary.`;

/**
 * Assembles the user-message payload: the retrieved knowledge as
 * ground truth, then the (anonymous) patient context, then the task.
 */
export function buildUserMessage(
  ctx: AgenticClinicalContext,
  knowledge: RetrievedKnowledge,
  policies: PolicyMatch[] = [],
): string {
  const k: string[] = ['## VEDAMD KNOWLEDGE (ground truth — reason only over this)'];

  if (knowledge.drugs.length) {
    k.push('\n### Drugs');
    for (const d of knowledge.drugs) k.push(`- [drug:${d.slug}] ${d.inn} — ${d.summary}`);
  }
  if (knowledge.interactions.length) {
    k.push('\n### Drug-drug interactions');
    for (const i of knowledge.interactions)
      k.push(
        `- [ddi:${i.slugA}+${i.slugB}] ${i.severity.toUpperCase()}: ${i.mechanism} | management: ${i.management}`,
      );
  }
  if (knowledge.conditions.length) {
    k.push('\n### Conditions');
    for (const c of knowledge.conditions)
      k.push(`- [condition:${c.slug}] ${c.title} — ${c.summary}`);
  }
  if (knowledge.procedures.length) {
    k.push('\n### Procedures');
    for (const p of knowledge.procedures)
      k.push(`- [procedure:${p.slug}] ${p.title} — ${p.summary}`);
  }
  if (knowledge.rules.length) {
    k.push('\n### CDS rules');
    for (const r of knowledge.rules) k.push(`- [rule:${r.id}] ${r.title} — ${r.description}`);
  }

  const c: string[] = ['\n## PATIENT CONTEXT (anonymous)'];
  if (ctx.hook) c.push(`- hook: ${ctx.hook}`);
  if (ctx.patient) {
    const p = ctx.patient;
    const bits: string[] = [];
    if (p.ageYears != null) bits.push(`age ${p.ageYears}y`);
    if (p.ageMonths != null) bits.push(`age ${p.ageMonths}mo`);
    if (p.sex) bits.push(p.sex);
    if (p.weightKg != null) bits.push(`${p.weightKg}kg`);
    if (p.pregnant) bits.push(`PREGNANT${p.gestationWeeks ? ` (${p.gestationWeeks}wk)` : ''}`);
    if (p.eGFR != null) bits.push(`eGFR ${p.eGFR}`);
    if (p.creatinineUmolL != null) bits.push(`creatinine ${p.creatinineUmolL} µmol/L`);
    if (bits.length) c.push(`- patient: ${bits.join(', ')}`);
  }
  if (ctx.medications?.length) c.push(`- medications: ${ctx.medications.join(', ')}`);
  if (ctx.diagnoses?.length) c.push(`- diagnoses: ${ctx.diagnoses.join(', ')}`);
  if (ctx.allergies?.length) c.push(`- allergies: ${ctx.allergies.join(', ')}`);
  if (ctx.labs?.length)
    c.push(
      `- labs: ${ctx.labs.map((l) => `${l.name ?? l.code}=${l.value}${l.unit ?? ''}`).join(', ')}`,
    );
  if (ctx.signals && Object.keys(ctx.signals).length)
    c.push(`- signals: ${JSON.stringify(ctx.signals)}`);

  const policySection: string[] = [];
  if (policies.length) {
    policySection.push(
      '\n## LOCAL POLICIES & STANDARDS (per-integrator — align recommendations with these)',
      'For each card you emit, also note in the rationale how the recommendation aligns with these local policy sections, and cite them as "Per [policy name] §[section title]". If a policy contradicts a deterministic safety check, surface the conflict — do not silently override safety.',
    );
    for (const p of policies) {
      policySection.push(
        `- [policy:${p.policyId}] ${p.name} (${p.source}${p.version ? ` ${p.version}` : ''})${
          p.sectionTitle ? ` §${p.sectionTitle}` : ''
        }: ${p.snippet}`,
      );
    }
  }

  const task = [
    '\n## TASK',
    ctx.question
      ? `Clinician question: "${ctx.question}"`
      : 'Evaluate this context for clinical safety issues, gaps, and actionable recommendations.',
    'Return ONLY the JSON object specified in your instructions.',
  ];

  return [...k, ...c, ...policySection, ...task].join('\n');
}
