/**
 * Dose-by-diagnosis protocol — weight-based mg/kg starting points
 * for one (diagnosis, line, medication) triple. The same shape the
 * frontend Dose calculator consumed when the dataset lived in the
 * client bundle. Moved server-side so the curated clinical content
 * isn't shipped to every browser visitor.
 */
export interface DoseProtocol {
  diagnosis: string;
  line: string;
  medication: string;
  preparation: string;
  route: string;
  frequency: string;
  /** Lower bound of the per-dose mg/kg range (or units/kg for penicillin). */
  minPerKg: number | null;
  /** Upper bound of the per-dose range. */
  maxPerKg: number | null;
  /** Absolute single-dose cap as a free-text string (e.g. "1g", "2MU"). */
  absoluteMax: string | null;
  minDurationDays: number | null;
  maxDurationDays: number | null;
  remarks: string | null;
}
