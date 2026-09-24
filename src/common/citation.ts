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
 * register. VedaMD clinical content is licensed CC BY-NC-SA 4.0
 * (content/LICENSE), so it may reproduce and adapt `public-domain`, `cc0`,
 * `cc-by`, `cc-by-nc` and `cc-by-nc-sa` sources; reproduce ND sources only
 * verbatim; keep share-alike-incompatible sources (`cc-by-sa`, `odbl`) as
 * separately licensed items; and only CITE proprietary or restricted ones.
 * The per-source reuse mode lives in content/sources/registry.json.
 * Facts/dosages themselves are not copyrightable; this flags the
 * provenance of the *expression*.
 */
export type CitationLicence =
  | 'public-domain' // e.g. US government works
  | 'cc0' // public-domain dedication (e.g. CPIC, Wikidata, OpenAlex)
  | 'cc-by' // reproduce + adapt with attribution (e.g. PLOS, WHO eEML)
  | 'cc-by-sa' // share-alike, commercial allowed (e.g. Wikipedia) — not mergeable into NC-SA
  | 'cc-by-nc' // non-commercial (e.g. SAMJ)
  | 'cc-by-nc-sa' // non-commercial + share-alike (e.g. WHO, OpenStax)
  | 'cc-by-nd' // no-derivatives, commercial allowed (e.g. ICD-11) — verbatim only
  | 'cc-by-nc-nd' // non-commercial + no-derivatives (e.g. StatPearls) — verbatim only
  | 'odbl' // Open Database Licence (e.g. OpenStreetMap, healthsites.io)
  | 'nc-reproduce' // custom "free / not for profit" reproduction terms (some MoH, NGO works)
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
