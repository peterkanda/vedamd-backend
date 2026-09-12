/**
 * Hard refusal gate for the cloud assistant — ports vedamd-mobile's
 * `src/llm/prompt.ts` (`isClinicalClaim` / `ungroundedRefusal`) so the cloud
 * engine enforces the same fail-closed posture as the on-device model,
 * rather than relying on a system-prompt instruction alone.
 *
 * Keep this in sync with the mobile copy by hand — there is no shared
 * package between the two repos today (see the plan's Fix 4 note).
 */

/**
 * Does answering this question require a specific clinical fact — a dose,
 * a drug choice, a contraindication, an interaction or a numeric threshold?
 *
 * These are the answers a clinician is most likely to act on directly and
 * least able to sanity-check, so when nothing relevant was retrieved we
 * refuse rather than letting the model answer from parametric memory.
 * General questions ("what causes jaundice in newborns?") stay answerable.
 */
const CLINICAL_CLAIM_PATTERNS = [
  /\bdos(e|es|ing|age)\b/i,
  /\bmg\b|\bmcg\b|\bml\b|\bg\/kg\b|\bmg\/kg\b|\biu\b/i,
  /\bhow (much|many)\b/i,
  /\b(maximum|max|minimum|min|loading|maintenance|paediatric|pediatric)\s+dose\b/i,
  /\bcontraindicat/i,
  /\binteract(s|ion|ions)?\b/i,
  /\btitrat/i,
  /\b(safe|safety|contraindicated|avoid)\b.*\b(pregnan|breastfeed|lactat|renal|hepatic|liver|kidney)/i,
  /\b(threshold|cut-?off|target range|therapeutic range)\b/i,
  /\bwhich (drug|antibiotic|medicine|medication)\b/i,
  /\b(prescribe|prescription|regimen)\b/i,
];

export function isClinicalClaim(question: string): boolean {
  return CLINICAL_CLAIM_PATTERNS.some((re) => re.test(question));
}

/** Shown instead of a model answer when we have nothing verified to stand on. */
export function ungroundedRefusal(): string {
  return [
    'I don’t have verified VedaMD content covering this question, and it turns on a specific clinical fact (a dose, drug choice, contraindication or threshold).',
    '',
    'Rather than answer from memory — which is where this kind of question goes wrong — I’ve stopped here. Please check your local formulary or national guideline, or try naming the drug or condition directly in case it is filed under a different name.',
  ].join('\n');
}
