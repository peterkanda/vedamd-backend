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
  /\bdos(e|es|ing|age|ages)\b/i,
  /\bmg\b|\bmcg\b|\bml\b|\bg\/kg\b|\bmg\/kg\b|\biu\b/i,
  // A number glued to a unit ("500mg", "7.5mg/kg", "14kg") — \b does not
  // separate a digit from a letter, so the pattern above missed these.
  /\d(?:[.,]\d+)?\s*(mg|mcg|µg|ug|g|kg|ml|iu|units?|mmol|meq)\b/i,
  /\bhow (much|many)\b/i,
  /\b(maximum|max|minimum|min|loading|maintenance|paediatric|pediatric)\s+dose\b/i,
  /\b(loading|maintenance)\b/i,
  /\bcontraindicat/i,
  /\binteract(s|ion|ions)?\b/i,
  /\btitrat/i,
  /\b(safe|safety|ok|okay|fine|allowed|contraindicated|avoid)\b.*\b(pregnan|breast ?feed|lactat|nursing|renal|hepatic|liver|kidney)/i,
  // …and the same question asked the other way round.
  /\b(pregnan\w*|breast ?feed\w*|lactat\w*|renal|hepatic|liver|kidney)\b.{0,40}\b(safe|ok|okay|allowed|avoid|contraindicated)\b/i,
  /\bcan (i|we|you) (give|use|prescribe|start|continue|combine|take|stop)\b/i,
  /\bis it (ok|okay|safe|fine) to\b/i,
  /\b(what|which|best|preferred|recommended)\s+(drugs?|antibiotics?|antimalarials?|antivirals?|antifungals?|antihypertensives?|anticoagulants?|analgesics?|medicines?|medications?|treatments?|regimens?)\b/i,
  /\b(drug|treatment|agent|antibiotic|medicine)s?\s+of\s+choice\b/i,
  /\b(first|second|third)[-\s]?line\b/i,
  /\b(antibiotics?|antimalarials?|antivirals?|antifungals?)\s+for\b/i,
  /\bhow (often|long|frequently)\b|\bfor how (long|many)\b|\bduration of (treatment|therapy|antibiotics?)\b/i,
  /\bunits?\s+(of|per)\b/i,
  /\btarget\b.{0,25}\b(hba1c|a1c|bp|blood pressure|inr|glucose|sugar|spo2|saturation|level|range)\b|\b(hba1c|a1c|inr|bp)\s+target\b/i,
  /\bat what\b.{0,30}\b(level|value|count|haemoglobin|hemoglobin|hb|glucose|sugar|bp|pressure|temperature|weight|cd4|viral load|creatinine|egfr)\b/i,
  /\b(threshold|cut-?off|target range|therapeutic range)\b/i,
  /\bwhich (drug|antibiotic|medicine|medication)\b/i,
  /\b(prescrib\w*|prescription|regimens?)\b/i,
  // Swahili: dose / how much, which drug, how many times / days, safe in
  // pregnancy or breastfeeding.
  /\b(kipimo|dozi|kiasi gani|dawa gani|mara ngapi|siku ngapi)\b/i,
  /\bsalama\b.*\b(mjamzito|ujauzito|kunyonyesha)\b/i,
];

export function isClinicalClaim(question: string): boolean {
  return CLINICAL_CLAIM_PATTERNS.some((re) => re.test(question));
}

/** Shown instead of a model answer when we have nothing verified to stand on. */
export function ungroundedRefusal(): string {
  return [
    'I don’t have VedaMD reference content covering this question, and it turns on a specific clinical fact (a dose, drug choice, contraindication or threshold).',
    '',
    'Rather than answer from memory — which is where this kind of question goes wrong — I’ve stopped here. Please check your local formulary or national guideline, or try naming the drug or condition directly in case it is filed under a different name.',
  ].join('\n');
}
