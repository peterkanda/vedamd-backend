# Manufacturer medicine labels — licensing position

Status: **working position, not legal advice.** Last checked 2026-09-17.
Machine-readable verdicts live in `content/sources/registry.json`; this note
records the evidence behind them.

## Summary

| Source | Verdict | What we do |
|---|---|---|
| US DailyMed / openFDA drug labels | Embeddable (tier 1), **pending legal sign-off on label text** | Ingest key-section excerpts + metadata as reference-only, `jurisdiction: US` |
| Kenya PPB SmPC index (`ppb-ke-smpc`) | Cite-only until PPB permission | Store links only (trade name → PDF URL) |
| Kenya PPB product register (`ppb-ke-register`) | Cite-only until PPB supplies data | No scraping; dataset requested |
| SAHPRA PI/PIL repository (`sahpra-pi-pil`) | Cite-only until permission | Nothing ingested; permission requested |
| EMA EPAR product information | Link only | Nothing ingested |
| UK emc / Datapharm | Prohibited without licence | Nothing ingested |
| Health Canada DPD (`hc-dpd`) | Verify | DPD data is OGL-Canada; monograph text unverified |
| Manufacturer websites | Not used | No scraping (copyright + site terms) |

Facts (a dose, a contraindication) are not copyrightable; the *wording* is.
Authoring our own statements of fact from any of these sources, with a
citation, remains permitted as it is today.

## Evidence

### US — openFDA / DailyMed
- openFDA terms (https://open.fda.gov/terms/): content is public domain under
  CC0 1.0, "even for commercial purposes, all without asking permission".
- **Caveat** — same terms: "Some data on openFDA may not be public domain, such
  as copies of copyrightable works made available to the FDA by private
  entities."
- DailyMed (https://dailymed.nlm.nih.gov/dailymed/about-dailymed.cfm): labeling
  is "submitted to the Food and Drug Administration (FDA) by companies" and
  "NLM does not review any SPL content prior to publication".
- NLM web policy: US government works are not copyrighted; reproduction of
  copyrighted items beyond fair use needs the holder's permission.

**Open item for counsel:** confirm that reproducing excerpts of FDA-approved
labeling (as distributed via openFDA/DailyMed) in a commercial CDS product is
acceptable. Until confirmed, excerpts stay in the draft lane
(`content/labels/`) and are not promoted into a signed bundle.

### Kenya — Pharmacy and Poisons Board
- SmPC index https://web.pharmacyboardkenya.org/smpc/ — ~3,781 PDF links
  (`products.pharmacyboardkenya.org/uploads/*.pdf`), identified by trade-name
  filename only. robots.txt allows the page.
- Register https://products.pharmacyboardkenya.org/ppb_admin/pages/public_view_retention_products.php
  — ~3,250 products; fields: registration no., trade name, INN, dosage form,
  country of origin, MAH, local technical representative, registration and
  expiry dates. 10 rows per page. **The public "Export into CSV" action returns
  "Restricted"**, which we read as PPB not offering bulk export publicly, so we
  do not page through it automatically.
- Footer: "Copyright © 2026 Pharmacy and Poisons Board. All Rights Reserved."
- Letter: `docs/label-permission-requests/ppb-ke.md`.

### South Africa — SAHPRA
- https://pi-pil-repository.sahpra.org.za/ — no terms of use or licence found.
- On 2026-09-17 the landing page contained an unrelated gambling hyperlink;
  confirm the site has not been tampered with before relying on it.
- Letter: `docs/label-permission-requests/sahpra.md`.

### EU — EMA
- Legal notice (https://www.ema.europa.eu/en/about-us/legal-notice): EMA
  content may be reproduced for commercial purposes with attribution, but
  "for documents where the copyright vests in a third party, permission for
  reproduction must be obtained from this copyright holder."

### UK — emc (Datapharm)
- Legal notice (https://www.medicines.org.uk/emc/privacy-notice-and-legal):
  material "must not be used, reproduced, linked to and/or sold for commercial
  benefit"; creating databases from downloaded material is prohibited.

### Canada — Health Canada DPD
- DPD API (https://health-products.canada.ca/api/documentation/dpd-documentation-en.html)
  is published under the Open Government Licence – Canada. Coverage of
  manufacturer product monographs is not confirmed.

## Guardrails in code
- `registry.json` verdicts drive ingestion: only `embeddable: yes` sources may
  contribute stored text.
- `scripts/check-licence-compliance.js` also walks `content/labels/` and fails
  any label whose source is not embeddable.
- Labels never overwrite `drugs.json`; differences become human review items.
