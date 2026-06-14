# Tanzania (TZ) — content authoring worklist

_Generated 2026-06-14 by scripts/ingest-country-content.ts. Licence-gated:
nothing below is reproduced; cite-only sources require ORIGINAL authoring._

## Status
`in-progress` — locale profile authored; clinical overlay not yet signed off.
Tanzania currently serves WHO/Kenya-default reference content with a "not yet
localized" label. Authoring the clinical domains below + clinical sign-off
(overlay.json `signedOff:true`) flips Tanzania to **localized**.

## Locale (authored)
- Patient-facing languages: sw, en
- Official languages: sw, en
- National formulary source: `moh-tz` (cite-only)
- National guidelines WHO-derived: yes


## EMBED lane — permissive base layer (safe to transform directly)
- **HL7 FHIR specification** (HL7) — `yes`, CC0-1.0
  https://hl7.org/fhir/
- **DailyMed structured product labels** (US NLM) — `yes`, US-Public-Domain
  https://dailymed.nlm.nih.gov/dailymed/
- **openFDA drug/label/event APIs** (US FDA) — `yes`, US-Public-Domain
  https://open.fda.gov/
  _Public domain. Do not imply FDA endorsement._
- **RxNorm drug terminology** (US NLM) — `yes`, UMLS-RxNorm (no restriction)
  https://www.nlm.nih.gov/research/umls/rxnorm/
  _Free via UMLS licence. Filter restricted UMLS source vocabularies (categories 1-4) before embedding._
- **LOINC lab/clinical observation codes** (Regenstrief Institute) — `yes`, LOINC-License
  https://loinc.org/
  _Commercial use permitted with attribution; do not alter codes._
- **AHRQ CDS Connect computable artifacts (CQL/FHIR)** (US AHRQ) — `yes`, US-Public-Domain
  https://cds.ahrq.gov/cdsconnect
  _Check per-artifact for embedded third-party content._
- **ONC high-priority drug-drug interaction list** (US ONC) — `yes`, US-Public-Domain
  https://www.healthit.gov/
- **DrugBank Open Data subset** (OMx / DrugBank) — `yes`, CC0-1.0
  https://go.drugbank.com/releases/latest#open-data
  _Open Data subset is CC0 (names/IDs/structures). Full database is CC BY-NC — see drugbank-full._

## WORKLIST lane — cite, do NOT reproduce (author original logic)
- **WHO SMART Guidelines L2/L3 FHIR Implementation Guides** (WHO) — `verify`, mixed (Apache-2.0 tooling / CC BY-NC-SA 3.0 IGO content)
  https://smart.who.int/
  _HIGHEST-LEVERAGE verify task. Code (Apache-2.0) and clinical content (WHO terms) are licensed separately; open LICENSE/NOTICE per repo (smart-anc, smart-immunizations, smart-family-planning, smart-hiv, smart-tb, smart-base) before embedding. If content is CC BY-NC-SA, rebuild equivalent logic rather than copying._
- **OCL platform + CIEL dictionary** (Open Concept Lab / Columbia) — `verify`, platform open-source; hosted content per-source
  https://openconceptlab.org/
  _Hosting confers no licence; assess CIEL terms specifically. Mirrored SNOMED/LOINC/ICD retain source licences._
- **ICD-11 classification + coding API** (WHO) — `verify`, CC BY-ND 3.0 IGO
  https://icd.who.int/icdapi
  _Actually CC BY-ND (commercial OK, NO derivatives). Unmodified classification embeddable with attribution; distributing a modified classification is forbidden. citationLicence approximated to the nearest ND enum value._
- **WHO narrative publications (EML, IMCI chart booklet, mhGAP-IG, AWaRe book, MEC for contraception)** (WHO) — `cite-only`, CC BY-NC-SA 3.0 IGO
  https://www.who.int/publications
  _NC blocks commercial embedding; SA would force the licence onto derivatives. Reference/link, and rebuild equivalent logic from underlying clinical facts; never copy protected text/figures. Commercial reuse needs written WHO permission (permissions@who.int)._
- **NICE guidelines + CKS** (NICE (UK)) — `cite-only`, NICE UK Open Content Licence
  https://www.nice.org.uk/
  _Non-commercial, UK-focused; commercial/international embedding needs a separate paid NICE licence._
- **StatPearls review articles** (StatPearls / NCBI Bookshelf) — `cite-only`, CC BY-NC-ND 4.0 (verify variant)
  https://www.ncbi.nlm.nih.gov/books/NBK430685/
  _NC + ND → not embeddable. Cite/link only._
- **MSF Medical Guidelines** (Médecins Sans Frontières) — `cite-only`, free non-commercial; permission for commercial
  https://medicalguidelines.msf.org/
  _Commercial embedding requires MSF permission._
- **Where There Is No Doctor (and related)** (Hesperian Health Guides) — `cite-only`, CC BY-NC-SA
  https://hesperian.org/
  _Non-commercial; permission required for commercial use._
- **Clinical training videos** (Global Health Media Project) — `cite-only`, CC BY-NC-ND
  https://globalhealthmedia.org/
  _NC + ND; bundling in a paid product needs direct permission._
- **Radiology reference** (Radiopaedia) — `cite-only`, CC BY-NC-SA
  https://radiopaedia.org/
- **LITFL critical-care/ECG reference** (Life in the Fast Lane) — `cite-only`, CC BY-NC-SA
  https://litfl.com/
- **Merck Manuals / Medscape / AMBOSS / UpToDate / DynaMed / BMJ Best Practice / Cochrane / GIDEON** (various) — `cite-only`, proprietary
  https://www.merckmanuals.com/
  _Free to read and/or commercial products but NOT openly licensed/redistributable. Do not embed._
- **SNOMED CT** (SNOMED International) — `verify`, Affiliate Licence (Kenya non-member → fees)
  https://www.snomed.org/
  _Kenya is not a member country → commercial use needs a paid Affiliate Licence. Prefer LOINC + RxNorm + ICD-11 + CIEL to defer SNOMED cost._
- **ATC/DDD classification** (WHO Collaborating Centre (Oslo)) — `verify`, copyright; paid commercial licence
  https://www.whocc.no/
  _Viewable free but commercial embedding requires a paid licence/data files._
- **DrugBank full database** (OMx / DrugBank) — `cite-only`, CC BY-NC (academic) / paid commercial
  https://go.drugbank.com/
  _Full DB is academic-only NC; commercial needs paid DrugBank licence. Use drugbank-open instead._
- **Tanzania Standard Treatment Guidelines + NEMLIT** (Tanzania Ministry of Health) — `cite-only`, Government of Tanzania copyright
  https://www.moh.go.tz/

## Whitespace domains to author (highest marginal value)
- [ ] Drug–drug interactions (assemble from DailyMed/RxNorm/ONC DDI)
- [ ] Weight-based paediatric dosing (locally available formulations)
- [ ] Renal & hepatic dose adjustment
- [ ] Antimicrobial stewardship / WHO AWaRe at point of care
- [ ] NCD algorithms — hypertension, diabetes, asthma/COPD
- [ ] ETAT+ triage & structured referral criteria
- [ ] Mental health — mhGAP intervention logic
- [ ] Patient/CHW-facing explanations in English + local language

## Sign-off checklist
- [ ] National overlay records authored & jurisdiction-tagged `TZ`
- [ ] Every record cites a graded, dated source (citation-strength gate)
- [ ] No reproduced text from cite-only sources (licence-compliance gate)
- [ ] MoH / programme permission secured where logic derives from national guidelines
- [ ] Clinical review complete → set overlay.json `signedOff: true`
