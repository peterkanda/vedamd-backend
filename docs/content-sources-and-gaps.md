# Content sources, gaps and licences

Status: **working position, not legal advice.** Researched and verified
2026-09-24. Machine-readable verdicts live in
[`content/sources/registry.json`](../content/sources/registry.json); this note
records what the content is missing, which sources could fill the gaps, and the
evidence behind each licence verdict.

## Summary

- **The bundle is thin where Kenyan primary care is busiest.** Across the
  1,529 condition records there are only 14 for HIV, 7 for TB, 8 for malaria
  and about 5 for essential hypertension. Oral health, patient leaflets,
  Kiswahili content and local stock data are almost absent.
- **It leans on sources it can only cite.** The three most-cited sources are:
  - NICE/BNF, 1,847 citations: UK, proprietary.
  - WHO, 1,678.
  - Specialty societies, 1,585: proprietary.

  Kenya MoH follows with 1,128.
- **Content is now non-commercial.** On 2026-09-24 VedaMD content was
  relicensed **CC BY-NC-SA 4.0** ([`content/LICENSE`](../content/LICENSE)).
  That makes WHO guidance adaptable. WHO's CC BY-NC-SA 3.0 IGO §4(b) allows
  adaptations under a later version with the same elements. It also opens up
  OpenStax, DDInter, SAMJ and the South African STGs, plus unaltered excerpts
  of StatPearls and some Kenya MoH documents.
- **These sources were usable all along and are still unused:**
  - Public domain: LactMed, LiverTox, NCI PDQ, CDC, clinicalinfo.hiv.gov.
  - WHO eEML (CC BY).
  - data.who.int (CC BY 4.0).
  - CC0: CPIC, Wikidata, TICO-19, OpenAlex.
  - CC BY African open-access journals, via the PMC Cloud Service.
- **Some sources stay blocked.** MSF, Hesperian (digital use), Liverpool HIV
  interactions, pre-2016 WHO titles and most Kenya MoH guidelines need
  permission; draft letters are in
  [`content-permission-requests/`](./content-permission-requests/). WikEM,
  Radiopaedia (AI use), IHME and DHS cannot be used.
- **Registry defects were fixed.** See [Registry changes](#registry-changes).

## 1. Coverage today (bundle v0.1.0)

7,144 records, all `draft` (0 approved). 11,385 citations: 2,899 without a URL,
and none declaring a licence per citation.

| Area | Records | Note |
|---|---|---|
| Conditions | 1,529 | 997 distinct ICD-10 codes; 122 codes have ≥3 records (`-extended`, `-comprehensive`, `-2024` variants) |
| Drugs | 855 | 416 with RxNorm (229 codes quarantined as wrong); 420 carry a KEML level |
| CDS rules | 819 | 0 with `localeMessages` |
| Drug interactions | 641 | |
| Pregnancy/lactation | 440 | |
| Reference ranges | 321 | LOINC on 315 |
| Clinical scores | 223 | |

**Strong:** emergency and critical care, toxicology (154 antidotes, 50
toxidromes), NTDs, mental health (mhGAP), oncology, contraception, and drug
safety in pregnancy.

**Thin, relative to Kenyan primary-care burden:**

| Area | Condition records |
|---|---|
| HIV | 14 |
| TB | 7 |
| Malaria | 8 |
| Essential hypertension | about 5 |
| CKD | 3 |
| Neonatal | 27 |
| Palliative | 7 |
| Geriatrics | about 12 |
| Rehabilitation | about 9 |
| GBV | 4 |

**Near-absent:**
- Oral health: 3 records.
- Imaging interpretation.
- Adult screening.
- Patient-facing leaflets: 21 clinician counselling records only.
- Kiswahili content: the web UI is translated, but no clinical records are; mobile is English-only.
- Local formulary and stock data.

**Missing medicines** (14 of 150 key SSA medicines checked): RUTF, F-75,
ReSoMal, rectal artesunate, suramin, melarsoprol, eflornithine, rifabutin,
secnidazole, benzyl benzoate, tetracycline eye ointment, silver
sulfadiazine, daclatasvir and retinol.

**Unused sources:** 28 of the 47 sources registered before this review were
never cited.

**Every country overlay worklist** repeats the same unauthored domains:
- paediatric weight-based dosing for local formulations;
- renal and hepatic dosing;
- AWaRe at the point of care;
- NCD algorithms;
- ETAT+ triage;
- mhGAP;
- patient/CHW explanations in local languages.

## 2. Gaps mapped to sources

The verdict column is for VedaMD's non-commercial CC BY-NC-SA 4.0 content.
*Adapt* = may be reproduced and adapted. *Verbatim* = unaltered excerpts
only. *Separate* = shipped as its own licensed item. *Permission* = letter
needed.

| Gap | Best sources | Verdict |
|---|---|---|
| HIV (14 conditions) | clinicalinfo.hiv.gov (public domain, not photos); WHO consolidated HIV guidelines and SMART HIV DAK (CC BY-NC-SA 3.0 IGO); Kenya ARV guidelines | Adapt / Adapt / Permission (MoU) |
| TB (7) | WHO consolidated TB guidelines and operational handbooks; CDC TB pages; LiverTox for TB-drug hepatotoxicity | Adapt / Adapt / Adapt |
| Malaria (8) | WHO malaria guidelines (also on MAGICapp); CDC Yellow Book malaria chapter (cdc.gov text only) | Adapt / Adapt |
| Hypertension, diabetes, CKD | WHO HEARTS and PEN packages; Kenya NCD guidelines | Adapt / Permission |
| Neonatal and child | IMCI sick young infant 2019; Pocket Book of primary health care for children 2022 (both NC-SA); Pocket Book of Hospital Care 2013 (all rights reserved); Kenya Basic Paediatric Protocols | Adapt / Adapt / Permission / Permission |
| Obstetrics | Kenya *Basic Obstetric Protocols 2026* | Verbatim (adapt needs MoU) |
| Missing medicines, essential medicines | WHO eEML (CC BY 3.0 IGO); SA PHC STGs/EML 8th ed | Adapt / Adapt |
| Lactation safety | LactMed (public domain) | Adapt — already cited 120× |
| Hepatic dosing and DILI | LiverTox (public domain) | Adapt |
| Drug interactions | DDInter 2.0 (CC BY-NC-SA 4.0); ONC DDI (public domain); Liverpool (all rights reserved) | Adapt with clinical review / Adapt / Permission |
| Pharmacogenomics | CPIC (CC0); PharmGKB (CC BY-SA) | Adapt / Separate |
| Oncology and palliative | NCI PDQ (public domain; say "adapted from NCI"); WHO palliative guidance | Adapt / Adapt |
| Screening | USPSTF (unchanged text only); WHO | Verbatim / Adapt |
| Patient leaflets | public-domain MedlinePlus pages; CDC; Hesperian (digital needs permission); WHO | Adapt / Adapt / Permission / Adapt |
| Kiswahili | TICO-19 (CC0 terminology); Masakhane (CC BY-NC); CLEAR Global glossaries (no licence stated) | Adapt / Adapt / Ask |
| Dermatology on dark skin | SCIN (custom permissive); Wikimedia Commons (per file); Mind the Gap (CC BY-SA, unconfirmed); DermNet (NC-ND, watermarked) | Adapt / Per item / Separate / Verbatim |
| Referral directory | KMHFL 2020 (CC BY); healthsites.io and OpenStreetMap (ODbL) | Adapt / Separate |
| Local context data | data.who.int (CC BY 4.0); Our World in Data's own data (CC BY 4.0) | Adapt |
| Condition duplicates | MONDO (CC BY), Disease Ontology (CC0), Wikidata (CC0) as crosswalks | Adapt |
| Evidence layer | CC BY articles via the PMC Cloud Service; OpenAlex (CC0) and Crossref for metadata | Adapt per article |
| Textbook background | OpenStax (CC BY-NC-SA 4.0); StatPearls (CC BY-NC-ND 4.0) | Adapt / Verbatim |

## 3. Licence verdicts and evidence

V = verified on the primary page. S = seen only in a search snippet or
secondary copy (primary page blocked). U = unverified.

### WHO

| Source | Licence | Commercial? | Verdict | Evidence |
|---|---|---|---|---|
| WHO publications (IRIS), post-2016 | CC BY-NC-SA 3.0 IGO | No | Adapt (per item) | V — who.int/about/policies/publishing/copyright; items added to IRIS on 2026-09-24 still carry it |
| Pre-2016 titles (Pocket Book 2013, IMCI chart booklet, Model Formulary 2008) | All rights reserved | No | Permission | V — IRIS 10665/81170 copyright page |
| SMART Guidelines | Contradictory per repo: smart-anc CC0 vs ANC DAK NC-SA; smart-immunizations config CC0 vs LICENSE NC-SA; smart-hiv config CC-BY-SA-3.0 vs page NC-SA; smart-base CC BY 3.0 IGO | Content no | Adapt as NC-SA; ask WHO | V — repo LICENSE files and IG licence pages |
| eEML | CC BY 3.0 IGO, "including for commercial purposes"; not with advertising of commercial products | Yes | Adapt | V — list.essentialmeds.org/licencing |
| data.who.int datasets | CC BY 4.0 (third-party datasets excluded) | Yes | Adapt | V — data.who.int/about/data/terms-and-conditions |
| ICD-11 | CC BY-ND 3.0 IGO; embedding unmodified in software is not an adaptation | Yes | Verbatim; translations need a WHO agreement | V — icd.who.int/en/docs/icd11-license.pdf |
| Growth-standard tables on who.int | Website terms: not for commercial use | No | Adapt (non-commercial); the WHO `anthro` repo is GPL-3 | V |
| CC BY-NC-SA 3.0 IGO §4(b) | Adaptations may use "a later version of this License with the same License Elements" | — | CC BY-NC-SA 4.0 is compatible | V — creativecommons.org/licenses/by-nc-sa/3.0/igo/legalcode |

### US government (public domain)

| Source | Licence | Verdict | Evidence |
|---|---|---|---|
| LactMed | Public domain (US government book) | Adapt | S (NCBI captcha); NLM web policy V |
| LiverTox | "Copyright free … public domain" | Adapt | S |
| NCI PDQ | "All text … is free of copyright"; say "adapted from the National Cancer Institute"; no logo | Adapt | V — cancer.gov/policies/copyright-reuse |
| CDC (STI 2021, Yellow Book on cdc.gov, Pink Book) | Public domain; label adaptations; don't change substantive content; no logos | Adapt | V — cdc.gov/other/agencymaterials.html |
| clinicalinfo.hiv.gov | Public domain; photographs excluded | Adapt | S |
| MedlinePlus | Public domain except A.D.A.M. and ASHP, which "may not" be ingested into health IT | Adapt the public-domain pages only | V |
| USPSTF | Unchanged reproduction only; not for a fee | Verbatim | V |
| ClinicalTrials.gov | Attribute; show processing date; state changes | Adapt | S |

### Literature and metadata

| Source | Licence | Verdict | Evidence |
|---|---|---|---|
| PMC OA subset | Per article. Legacy FTP and the OA Web Service were removed the week of 24 Aug 2026; use the PMC Cloud Service | Adapt CC0/BY/BY-NC/BY-NC-SA; verbatim for ND; separate for BY-SA | V — NLM Technical Bulletin Jan–Feb 2026; pmc.ncbi.nlm.nih.gov/tools/cloud |
| Europe PMC | Per article | As PMC | S |
| PubMed | Abstracts are publisher/author copyright | Cite only | V — NLM policies |
| OpenAlex | CC0 (abstract text probably excluded) | Adapt metadata | V |
| Crossref | Metadata are facts; abstracts copyrighted | Adapt metadata | V |
| PLOS, PAMJ, AOSIS (AJPHCFM, SAFP), eLife, Frontiers, JPHIA | CC BY 4.0. AOSIS reserves TDM/AI rights on its website, so take text from PMC | Adapt | V (MDPI S) |
| African Health Sciences | CC BY 4.0, plus "no substantive errors are introduced" | Adapt with care | V |
| SAMJ | CC BY-NC 4.0 | Adapt | V |
| Malawi Medical Journal | CC BY-NC-ND per DOAJ (updated 2026-09-17); other sources say CC BY | Verbatim unless the article says otherwise | V (DOAJ) |
| Lancet, BMJ, BMC | Per article: CC BY / BY-NC / BY-NC-ND / subscription | Per item | V (DOAJ) |
| Cochrane | Gold OA CC BY-NC or BY-NC-ND; green OA is not CC; plain-language summaries via RightsLink | Per item | V |
| medRxiv/bioRxiv | Author's choice per preprint | Per item | V |
| Epistemonikos | Terms say non-commercial; abstracts third-party | Not registered | V |

### Textbooks, ontologies and data

| Source | Licence | Verdict | Evidence |
|---|---|---|---|
| OpenStax (all titles) | CC BY-NC-SA 4.0 | Adapt | V |
| StatPearls | CC BY-NC-ND 4.0 | Verbatim | S (NCBI captcha) |
| LibreTexts | Per page | Per item | S |
| Wikipedia / WikiDoc | CC BY-SA 4.0 / 3.0 | Separate | V |
| WikEM | CC BY-SA 3.0, but the terms ban AI training/evaluation and scraping | Cite only | V |
| CPIC | CC0 | Adapt | V |
| PharmGKB/ClinPGx | CC BY-SA 4.0; data may not be sold | Separate | V |
| DDInter 2.0 | CC BY-NC-SA 4.0 | Adapt with clinical review | V |
| Liverpool HIV/hep interactions | No reuse without written consent | Permission | V |
| OnSIDES | CC BY 4.0 | Adapt | V |
| MONDO, ChEBI | CC BY 4.0 | Adapt | V |
| Disease Ontology, Wikidata | CC0 | Adapt | V |
| HPO | Custom: no alteration | Verbatim | V |
| MeSH | NLM terms; translations excluded | Adapt | V |

### Africa-specific

| Source | Licence | Verdict | Evidence |
|---|---|---|---|
| Kenya *Basic Obstetric Protocols 2026* | "may be quoted or reproduced, provided the source is acknowledged. It may not be sold or used for any commercial purposes or for profit" | Verbatim | V — PDF p.2 |
| Kenya *Clinical Guidelines Vol 2 (2024)* | No reuse statement | Permission | V — full text searched |
| KEML 2023 | "may be freely reviewed, quoted, reproduced, or translated … provided that the source is acknowledged" | Confirm with MoH | S (third-party copy) |
| SA PHC STGs/EML 8th ed (2024) | "may be reproduced, copied or adapted to meet local needs … distributed free of charge … not for profit" | Adapt | V — PDF front matter |
| Uganda UCG / EMHSLU | "not for profit" reproduction | Confirm the 2023 edition | S |
| Ghana STG 2017 | All rights reserved | Cite only | S |
| KMHFL 2020 snapshot | CC BY (openAFRICA) | Adapt | V |
| healthsites.io / OpenStreetMap | ODbL | Separate | V |
| Our World in Data | CC BY 4.0 (own data only) | Adapt | V |
| IHME GBD | Non-commercial user agreement, no redistribution | Cite only | S |
| DHS Program | No sharing without consent | Cite only | S |
| Community Health Toolkit configs | AGPL-3.0 | Not used (copyleft code) | V |
| ePOCT+/medAL | Licence not stated | Not used | U |

### Other sources checked

| Source | Licence | Verdict | Evidence |
|---|---|---|---|
| MSF Clinical Guidelines (June 2025) | "All rights reserved … No reproduction, translation and adaptation … without the prior permission" | Permission | V |
| Hesperian | Open Copyright for free/at-cost print; "contact Hesperian for written permission to use our materials in any digital format" | Permission | V |
| Radiopaedia | CC BY-NC-SA 3.0, but any AI/ML use needs an application and a USD 250 fee | Cite only | V |
| LITFL | CC BY-NC-SA 4.0 believed; page blocked | Verify | U |
| Global Health Media | Creative Commons, variant unconfirmed | Verify (verbatim) | S |
| DermNet | Watermarked, non-commercial, no derivatives; print runs over 500 count as commercial | Verify (verbatim) | V |
| Fitzpatrick17k | CC BY-NC-SA 3.0, but the images come from third-party atlases | Not used | V |
| SCIN | Custom licence: reproduce/share/adapt; no re-identification | Adapt | V |
| TICO-19 | CC0 (includes Swahili) | Adapt | V |
| Masakhane datasets | Per dataset: CC BY-NC 4.0 or CC BY 4.0 | Per item | V |
| AfriMed-QA | Conflict: CC BY-SA 4.0 (HF) vs CC BY-NC-SA 4.0 (GitHub) | Evaluation only; ask | V |
| MedQA, MedMCQA, PubMedQA, HealthBench | MIT / Apache-2.0 | Evaluation only | V |

## 4. Content from users

VedaMD already collects some user input, but none of it reaches the content
pipeline:
- **Mobile "missing content" feedback** goes to Supabase `vedamd_app_feedback`, which nothing reads.
- **CDS Hooks accept/override feedback** is stored.
- **Per-tenant custom rules and policies** bypass clinical review.

Opportunities, in order of value:

1. **Clinician reviewers.** 0 of 7,144 records are approved, so review is
   the bottleneck, not authoring. Recruit Kenyan clinicians, ideally
   nominated by MoH technical working groups (see the MoH letter), into the
   existing two-reviewer workflow.
2. **Connect "missing content" feedback to the governance worklist,** and
   add a record-level "report an issue" feature on web and mobile that
   creates a correction proposal tied to the record hash.
3. **Question misses as gap signals.** Aggregate, anonymous counts of
   questions the assistant refused for lack of content. Never store the
   question text with anything identifying.
4. **Facility formulary and stock availability,** at facility level so
   advice can prefer medicines that are actually in stock.
5. **Local antibiograms** from hospital labs (e.g. WHONET exports), in
   aggregate, to localise AWaRe advice.
6. **Kiswahili translation,** seeded with TICO-19 terminology and reviewed
   by clinicians.

Contributions come in under the content licence (CC BY-NC-SA 4.0) with an
attestation: no patient data, rights to the material, conflicts declared.
See [CONTRIBUTING.md](../CONTRIBUTING.md#contributing-clinical-content).

## 5. Permission requests

Drafts in [`content-permission-requests/`](./content-permission-requests/):

| Letter | Asks for |
|---|---|
| [who.md](./content-permission-requests/who.md) | Non-commercial status of use in private clinics and commercial EMRs; pre-2016 titles; SMART licence clarification; ICD-11 Kiswahili/mapping; GHO API terms |
| [moh-ke.md](./content-permission-requests/moh-ke.md) | MoU to adapt national guidelines; KEML terms; KMHFR API terms; reviewer nominations |
| [msf.md](./content-permission-requests/msf.md) | Non-commercial digital excerpts and adaptation of the Clinical Guidelines and Essential Drugs guide |
| [hesperian.md](./content-permission-requests/hesperian.md) | Digital use and Kiswahili translation |
| [liverpool-hiv.md](./content-permission-requests/liverpool-hiv.md) | Non-commercial data licence, API or deep links |
| [afrimed-qa.md](./content-permission-requests/afrimed-qa.md) | Which licence applies; evaluation use |

The PPB and SAHPRA label requests are in
[`label-permission-requests/`](./label-permission-requests/).

## 6. Risks and open items

- **Non-commercial binds everyone downstream.** Commercial integrators, such
  as the Epic/Oracle plugin and private for-profit clinics, may not be able
  to use NC-derived records. Each source has a `commercialUse` flag so a
  commercial-safe subset can be served later. The WHO letter asks WHO
  directly about private clinics.
- **One-way door.** Records adapted from WHO or other NC-SA material can
  never be relicensed commercially.
- **Share-alike mixing.** CC BY-SA (Wikipedia, PharmGKB) and ODbL
  (OpenStreetMap) material cannot be merged into CC BY-NC-SA records; keep
  it as separately licensed items.
- **Per-item licences.** WHO IRIS, PMC, Kenya MoH, hybrid journals and
  NCBI Bookshelf vary by document. Record each item's licence at
  ingestion; the registry marks these sources `verify`.
- **Terminologies already in the bundle.** SNOMED CT (716 concepts) needs
  an Affiliate Licence in Kenya; distribution of ATC and ICD-10 codes is
  unconfirmed. See [`content/NOTICE`](../content/NOTICE).
- **Regulation.** PPB's draft medical-device software guidance (April 2026)
  expects clinical evidence "supported by literature". Per-record provenance
  supports that.
- **Wording.** The README still calls the software "open source". Apache-2.0
  + Commons Clause is source-available, as decided earlier.
- **Environment.** The legacy PMC FTP pipelines no longer work, since
  August 2026.

## 7. Suggested ingestion order (next pass)

1. **Public domain and CC0, already cited:** LactMed (120 citations point at
   it), LiverTox, CPIC (63 citations). Tag each citation's licence.
2. **Essential medicines:** the WHO eEML, to fill the 14 missing medicines
   and the 435 drugs without a KEML level cross-check.
3. **Thin programmes, from WHO (NC-SA) and CDC/NIH (public domain):** HIV,
   TB, malaria, NCDs, neonatal. Clinical review before promotion.
4. **Kiswahili:** TICO-19 glossary, then patient explanations from
   public-domain MedlinePlus and CDC material.
5. **Crosswalks:** MONDO, Disease Ontology and Wikidata, to de-duplicate
   condition records.
6. **Evidence layer:** CC BY articles via the PMC Cloud Service, starting
   with the African journals.

## Registry changes

Made 2026-09-24:

**Schema:**
- New fields: `reuseMode`, `commercialUse`, `licenceScope`/`itemLicences`, `urlPrefixes`.
- Registry-level `contentLicence`.
- Six new `CitationLicence` values: `cc0`, `cc-by-sa`, `cc-by-nc`, `cc-by-nd`, `odbl`, `nc-reproduce`.

**Fixes:**
- `ncbi.nlm.nih.gov` belonged to StatPearls, so all 243 NCBI, PMC and PubMed citations were classed NC-ND. They now resolve to LactMed, LiverTox, StatPearls, NCBI Bookshelf, PMC or PubMed.
- USPSTF split out of public-domain `us-gov-health`.
- Frontiers moved out of "proprietary" to the CC BY journals entry.
- The Lancet, BMJ and BioMed Central moved to a per-article entry.
- CPIC (CC0) and PharmGKB (CC BY-SA) moved out of "specialty societies".
- Liverpool moved to its own entry.
- Cochrane moved out of "proprietary point-of-care".
- ICD-11 corrected to CC BY-ND.
- MSF's "free non-commercial" corrected to all rights reserved.

**Growth:** 47 → 101 sources. Four came from a parallel change merged on 2026-09-24: EMA (per item), WHO prequalification (link only), WHO child growth standards and CDC growth charts. That change also added LactMed, LiverTox and the eEML, which duplicated entries here and were merged into them.

**Citation census** (11,385 citations):

| Class | Before | After |
|---|---|---|
| Embeddable | 687 | 897 |
| Verify | 3 | 3,145 (WHO, Kenya MoH and EMA now per-item) |
| Cite-only | 7,796 | 4,444 |

**Tests:** new invariants in
[`test/licence-compliance.spec.ts`](../test/licence-compliance.spec.ts) check
each reuse mode against its licence, per-item consistency and host collisions.
