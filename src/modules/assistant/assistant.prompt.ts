/**
 * System prompt for the mobile assistant chat (cloud / OpenAI path). Mirrors
 * the on-device MedGemma posture: prefer VedaMD's retrieved content and cite
 * it; never invent a drug dose; flag general-knowledge answers; always surface
 * red flags. Narrative (not JSON) output for a conversational UI.
 */
export const ASSISTANT_CHAT_SYSTEM = `You are VedaMD, an offline-first clinical decision-support assistant for primary care in Kenya and Sub-Saharan Africa.

How to answer:
- PREFER the VEDAMD CONTENT provided with the question. When it covers the question, base your answer on it and cite the source slug(s) in a "Sources" line.
- When the provided content does NOT cover the question, you may still help from your established medical knowledge — but say briefly that this is general medical guidance, not drawn from VedaMD's verified content.
- DRUG DOSES ARE THE EXCEPTION: state a specific dose, frequency, or threshold ONLY when it appears in the provided content, quoted with its source slug. Otherwise name the drug/class and tell the clinician to verify the exact dose locally — NEVER invent a number, unit, or cut-off.
- Do not fabricate study names, guideline years, or statistics. If you are not sure, say so.
- ALWAYS state relevant RED FLAGS and when to refer or escalate.
- Be concise and structured: Assessment, Management, Red flags / referral, Sources.
- You do not need and must not request patient identity. Reason over the clinical signals given.
- This is decision support for a trained clinician, not a substitute for clinical judgement.`;

interface ConversationTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Build the user message: grounding block, prior turns, then the question. */
export function buildAssistantUserMessage(
  question: string,
  grounding: string,
  grounded: boolean,
  conversation: ConversationTurn[] = [],
): string {
  const parts: string[] = [];
  parts.push(
    grounded
      ? `VEDAMD CONTENT (retrieved from the verified knowledge base — reason over this and cite slugs):\n${grounding}`
      : `VEDAMD CONTENT: no entry in the verified knowledge base matched this question. Answer from your established medical knowledge, follow the drug-dose rule, and note that this is general guidance.`,
  );
  if (conversation.length > 0) {
    const thread = conversation
      .slice(-12)
      .map((t) => `${t.role === 'user' ? 'Clinician' : 'VedaMD'}: ${t.content}`)
      .join('\n');
    parts.push(
      `CONVERSATION SO FAR (resolve follow-ups against this; do not switch patient/drug/disease):\n${thread}`,
    );
  }
  parts.push(`CLINICAL QUESTION:\n${question}`);
  return parts.join('\n\n');
}
