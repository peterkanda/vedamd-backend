export interface FreshnessRecord {
  /** Bundle file the record came from (e.g. "drugs.json"). */
  source: string;
  /** Stable slug / id within that file. */
  slug: string;
  /** Human title for surfacing on dashboards. */
  title: string;
  /** Newest reference year we could parse from the record's references, or
   *  null when none of the labels / URLs carried a date hint. */
  newestRefYear: number | null;
  /** Why this record is on the queue: 'stale' | 'no-date' | 'no-refs'. */
  reason: 'stale' | 'no-date' | 'no-refs';
}

export interface FreshnessReport {
  /** When this report was generated. */
  generatedAt: string;
  /** Threshold the audit used. */
  staleAfterYears: number;
  /** Total records scanned. */
  scanned: number;
  /** Total flagged across all reasons. */
  flagged: number;
  /** Per-bundle-file count of flagged records. */
  byFile: Record<string, number>;
  /** Per-reason counts. */
  byReason: Record<'stale' | 'no-date' | 'no-refs', number>;
  /** First 200 flagged records (top of the review queue). */
  topQueue: FreshnessRecord[];
}
