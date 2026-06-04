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

export interface Citation {
  label: string;
  url?: string;
  strength?: CitationStrength;
}
