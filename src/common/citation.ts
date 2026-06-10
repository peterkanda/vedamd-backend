/**
 * Shared citation shape used by every content domain.
 *
 * `strength` is the auto-classified source-quality tier:
 *   A — International guideline body, government regulator, Cochrane
 *       review, or top-tier peer-reviewed journal (NEJM/Lancet/JAMA/
 *       BMJ/Circulation/society-published guideline journals).
 *   B — Peer-reviewed specialty publication or recognised formulary
 *       (OUP/Wiley/Elsevier journals, BNF, BNFc, LactMed, LiverTox,
 *       Sanford Guide, Briggs).
 *   C — Other authoritative reference (StatPearls, NIH Bookshelf
 *       reviews, society educational materials, academic-centre
 *       protocols).
 *   D — Consumer / wiki / encyclopedic source (Wikipedia, WebMD,
 *       Healthline, Patient.info, drugs.com). Allowed but explicitly
 *       labelled — clinicians see the lower strength.
 *
 * Auto-classified by scripts/score-citation-sources.js based on URL
 * host and label keywords. The CI gate
 * scripts/check-citation-strength.js enforces that every reference
 * carries a strength value before a bundle can be signed.
 */
export type CitationStrength = 'A' | 'B' | 'C' | 'D';

/**
 * What kind of source a citation points at. Drives both the strength
 * heuristic and the reuse/licence rules (see `licence`).
 */
export type CitationSourceType =
  | 'guideline' // national/international clinical guideline (e.g. Kenya MoH, WHO)
  | 'drug-label' // regulator drug label (e.g. US FDA / DailyMed)
  | 'formulary' // BNF, KNMF, WHO Model Formulary
  | 'journal' // peer-reviewed article
  | 'textbook' // reference textbook / manual
  | 'reference' // other authoritative reference (StatPearls, society material)
  | 'consumer'; // consumer/wiki source

/**
 * Reuse/licence status of the cited source. Supports the copyright
 * register: content may freely REPRODUCE `public-domain` / `cc-by`
 * sources, but only CITE (never reproduce/adapt) proprietary or
 * non-commercial-licensed sources. Kenyan government works are
 * copyright-protected with no open licence — `moh-restricted`.
 * Facts/dosages themselves are not copyrightable; this flags the
 * provenance of the *expression*.
 */
export type CitationLicence =
  | 'public-domain' // e.g. US FDA labels (CC0)
  | 'cc-by' // reproduce + adapt with attribution (e.g. STOPP/START v3)
  | 'cc-by-nc-sa' // non-commercial + share-alike (e.g. WHO) — cite, don't reproduce commercially
  | 'cc-by-nc-nd' // non-commercial + no-derivatives (e.g. KDIGO)
  | 'open-gov' // open government licence (e.g. NICE UK)
  | 'proprietary' // licence/permission required (BNF, NCCN, ESC, ADA, Merck, UpToDate)
  | 'moh-restricted' // Kenya MoH government work — copyright-protected, no open licence
  | 'unknown';

/**
 * Shared citation shape used by every content domain.
 *
 * `strength` is the auto-classified source-quality tier (A best … D
 * consumer); see scripts/score-citation-sources.js. The CI gate
 * scripts/check-citation-strength.js + test/citation-integrity.spec.ts
 * enforce coverage.
 *
 * The optional provenance fields below bring citations up to the
 * standard the major point-of-care references use (edition/year +
 * accessed/last-reviewed date + stable identifier). They are additive:
 * existing citations that embed the year in `label` remain valid, and
 * the integrity guard ratchets coverage upward over time rather than
 * breaking the bundle.
 */
export interface Citation {
  label: string;
  url?: string;
  strength?: CitationStrength;
  /** Publication / edition year, e.g. 2022. */
  year?: number;
  /** Edition or version descriptor, e.g. "5th ed" or "v3". */
  edition?: string;
  /** ISO-8601 date the source was last accessed / verified. */
  accessedDate?: string;
  /** Stable identifier: DOI, ISBN, PMID, or canonical URL. */
  identifier?: string;
  /** Kind of source — drives strength + reuse rules. */
  sourceType?: CitationSourceType;
  /** Reuse/licence status (copyright register). */
  licence?: CitationLicence;
}
