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

export interface ClinicalToolsResponse {
  doseDrugs: DoseDrug[];
  vitals: VitalsBand[];
  scoringSystems: ScoringSystem[];
}
