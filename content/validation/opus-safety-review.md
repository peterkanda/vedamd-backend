# Opus safety review (manual second opinion)

Reviewer: Claude Opus (claude-opus-4-8), acting as a medical-content screen.
Date: 2026-06-14.

**This is a screen, not clinical sign-off.** Opus is strong on medical
benchmarks but is still an LLM. Two specific caveats:
- For the **national overlay content** (first-line choices, EML), the same model
  family helped author it, so this review has a **blind-spot** — an independent
  run (`npm run validate:claude` / `validate:medgemma`) and a clinician check are
  the stronger guards.
- For the **pre-existing bundle dose items** (the 363 in `perkg-dose-review.md`),
  this review is **independent** of how that content was authored.

---

## 1. National first-line CHOICES (9 country overlays) — verdict: PASS, with notes

The authored first-line choices match WHO and standard national practice:

| Condition | First-line authored | Verdict |
|---|---|---|
| Uncomplicated malaria | Artemether-lumefantrine (ACT) | ✅ correct first-line for falciparum |
| Severe malaria | IV/IM artesunate | ✅ correct |
| Childhood pneumonia (non-severe) | Oral amoxicillin | ✅ correct (IMCI/WHO) |
| Diarrhoea + dehydration | ORS + zinc | ✅ correct |
| Pulmonary TB (drug-susceptible) | 2HRZE / 4HR | ✅ correct |
| HIV first-line | TLD (TDF+3TC+DTG) | ✅ correct, current WHO-preferred |

Notes to verify per country (not errors, context):
- **South Africa**: malaria is **not** countrywide-endemic (NE provinces + travel);
  the "endemic area" framing should read as risk-based there. AL remains correct.
- **Second-line ACT** can differ by country (e.g. artesunate-amodiaquine,
  dihydroartemisinin-piperaquine) — overlays state first-line only; confirm each
  national second-line when that depth is added.
- TLD paediatric/■pregnancy nuances are deferred to national weight bands (correct).

## 2. EML AWaRe tiers — spot-check: PASS

Antibiotic AWaRe classifications in the essential-medicines overlays are correct
against WHO AWaRe 2023: amoxicillin/amoxicillin-clavulanate/benzylpenicillin/
co-trimoxazole/doxycycline/gentamicin/metronidazole/nitrofurantoin = **Access**;
ceftriaxone/ciprofloxacin/azithromycin = **Watch**. No misclassification found.

## 3. Per-kg dose maxima — recommended caps for the worklist

For the common high-risk paediatric drugs in `content/safety/perkg-dose-review.md`,
the standard maximum (cap) to add. **Advisory reference values — confirm against
the national formulary/BNFc before applying.**

| Drug | Weight-based dose | Recommended MAX to add |
|---|---|---|
| Paracetamol | 15 mg/kg/dose | 1 g/dose; 4 g/day (60 mg/kg/day) |
| Ibuprofen | 10 mg/kg/dose | 400 mg/dose; 1.2 g/day (OTC) |
| Amoxicillin | up to 80–90 mg/kg/day | ~1 g/dose; 3 g/day |
| Ceftriaxone | 50–80 mg/kg/day | 2 g/day (4 g/day in meningitis) |
| Gentamicin | 5–7.5 mg/kg once daily | per level; avoid >7.5 mg/kg/day |
| Ciprofloxacin (paeds) | 10–20 mg/kg/dose | 750 mg/dose |
| Azithromycin | 10 mg/kg/dose | 500 mg/dose |
| Prednisolone | 1–2 mg/kg/day | 40–60 mg/day |
| Adrenaline IM (anaphylaxis) | 0.01 mg/kg (1:1000) | 0.5 mg/dose (0.3 mg < 6 yrs) |
| Diazepam (seizure) | 0.2–0.3 mg/kg IV | 10 mg/dose |
| Morphine | 0.1 mg/kg | titrate; no flat cap — use with caution |
| Chlorphenamine | 0.2 mg/kg | per age band; do not exceed adult max |

Drugs that are correctly **weight-banded by chart, not mg/kg** (no flat cap needed):
artemether-lumefantrine, most ACTs, ORS/zinc (volume/age-based).

## Overall

- **No incorrect first-line drug choice found** in the country overlays.
- **No AWaRe misclassification found.**
- The actionable safety gap is the **363 per-kg doses missing an explicit max**
  in the legacy bundle — add the caps above (clinician-confirmed) and ratchet the
  `check:clinical-safety` ceiling down as they are fixed.

Recommended next step: run the validator independently with Claude
(`ANTHROPIC_API_KEY=… npm run validate:claude`) for a full per-record pass, then
apply clinician-confirmed maxima from the worklist and re-sign the bundle.
