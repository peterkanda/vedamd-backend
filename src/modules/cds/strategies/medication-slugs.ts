/**
 * Medication slugs from a CDS context, across every field a caller or the
 * FHIR normaliser may use, de-duplicated. The normaliser files one drug under
 * several of these fields, so without de-duplication the renal, pregnancy and
 * stewardship rules emitted the same card up to three times.
 */
export function extractMedicationSlugs(context: Record<string, unknown>): string[] {
  const fields = ['medications', 'proposed', 'current', 'draftMedications', 'currentMedications'];
  const out = new Set<string>();
  for (const f of fields) {
    const v = context[f];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string') out.add(item);
      }
    }
  }
  return [...out];
}
