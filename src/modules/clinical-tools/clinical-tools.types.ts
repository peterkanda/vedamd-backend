/**
 * Reference data for the bedside calculators on /app/tools.
 *
 * These values are clinical IP — paediatric mg/kg dosing tables,
 * validated scoring-system weights + thresholds (NEWS2 / qSOFA /
 * Wells PE / CHA2DS2-VASc), and the IMCI/APLS paediatric vital-sign
 * reference table — that previously lived in the frontend bundle and
 * was readable in any browser's main JS file. Moved server-side so
 * the curation work is behind ApiKeyGuard + content:read.
 *
 * Calculator math stays in the frontend (per-calculator React state);
 * this module only ships the static normative data.
 */

export interface DoseDrug {
  id: string;
  name: string;
  indication: string;
  mgPerKgPerDose: number;
  maxMgPerDose?: number;
  maxMgPerKgPerDay?: number;
  frequency: string;
  route: string;
  notes?: string;
  minAgeMonths?: number;
}

export interface VitalsBand {
  band: string;
  hr: string;
  rr: string;
  sysBp: string;
  spo2: string;
}

export interface ScoringOption {
  label: string;
  score: number;
}

export interface ScoringAxis {
  id: string;
  label: string;
  /** For weighted scoring systems (Wells, CHA2DS2-VASc): the per-item score on selection. */
  points?: number;
  /** For multi-band systems (NEWS2, qSOFA): the options per band. */
  options?: ScoringOption[];
}

export interface ScoringSystem {
  id: string;
  name: string;
  citation: string;
  /** Either single-toggle scoring (per-item points) OR band-selection (options per axis). */
  type: 'toggle' | 'band';
  axes: ScoringAxis[];
}

/**
 * Equianalgesic opioid reference — for opioid rotation / route switching.
 * Stored as oral morphine equivalents (OME, mg PO morphine ≡ 1 unit of
 * this drug). The calculator converts from drug X dose to OME then to
 * drug Y dose with an explicit incomplete-cross-tolerance reduction
 * (default 25–50%) and route-of-administration factor.
 *
 * Values from AAHPM 2023 Opioid Equianalgesic Table — the conservative
 * end of published ranges. Methadone is intentionally excluded from
 * conversion-table calculation: methadone equivalence is dose-dependent
 * and non-linear; the UI must surface a "specialist required" message
 * for methadone rotations.
 */
export interface EquianalgesicOpioid {
  id: string;
  name: string;
  route: 'PO' | 'IV' | 'IM' | 'SC' | 'transdermal' | 'sublingual';
  /** mg of THIS drug-route that equals 30 mg oral morphine. */
  doseEquivalentTo30mgOralMorphine: number;
  /**
   * Default conservative duration for steady-state planning, in hours.
   * Used by the UI to show "give every ~Xh" alongside the converted dose.
   */
  defaultDurationHours: number;
  /**
   * Practical notes — onset, ceiling effects, organ-failure caveats.
   * Surfaced in the calculator result panel.
   */
  notes?: string;
}

export interface ClinicalToolsResponse {
  doseDrugs: DoseDrug[];
  vitals: VitalsBand[];
  scoringSystems: ScoringSystem[];
  equianalgesicOpioids: EquianalgesicOpioid[];
}
