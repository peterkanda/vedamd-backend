# Opus safety review — full content pass

Reviewer: Claude Opus (claude-opus-4-8), as a medical-content screen. 2026-06-14.
Scope reviewed directly (no external API — Opus is the reviewer):
- all 9 country overlay domains (conditions, essential-medicines, immunization,
  notifiable, preventive-care, symptom-triage) via the shared template + each
  country's deltas;
- every **distinct** per-kg dose phrase behind the 363 legacy-bundle flags
  (934 distinct sentences across conditions/cds-rules/drugs/antidotes/…);
- the WHO-baseline first-line choices and EML AWaRe tiers.

**A screen, not clinical sign-off.** Caveats: for overlay content the same model
family helped author it (blind-spot — prefer an independent `validate:claude`
run + clinician glance); for the legacy bundle doses this review is independent.

---

## Headline result
**No incorrect first-line drug choice and no AWaRe misclassification found.** The
dose-without-max flags are, on review, **mostly NOT overdose errors** — they are
specialist/adult/toxicology/single pre-referral weight-based doses where a flat
"max" is not the appropriate construct. The content is in substantially better
shape than the raw "363" number implied.

## 1. National first-line choices (9 countries) — PASS
AL (uncomplicated malaria), IV artesunate (severe), oral amoxicillin (childhood
pneumonia), ORS+zinc (diarrhoea), 2HRZE/4HR (TB), TLD (HIV) — all correct vs WHO
+ national standard. Context to confirm (not errors): SA malaria is risk/travel-
based not countrywide; national second-line ACTs differ (overlays state first-
line only).

## 2. EML AWaRe tiers — PASS
Access/Watch classifications all correct vs WHO AWaRe 2023 (amoxicillin, co-trim,
gentamicin, metronidazole, doxycycline, nitrofurantoin = Access; ceftriaxone,
ciprofloxacin, azithromycin = Watch).

## 3. Per-kg doses (the "363/934") — re-characterised
Reviewing the distinct phrases, the flags fall into:
- **Specialist/adult reversal & toxicology** (the majority): 4F-PCC 25–50 IU/kg,
  aPCC/FEIBA 20 IU/kg, rFVIIa 90 mcg/kg, andexanet, DMSA 10 mg/kg, BAL 3–5 mg/kg,
  methylene blue 1–2 mg/kg, fomepizole 15 mg/kg, hydroxocobalamin (paeds 70 mg/kg),
  ILE 1.5 mL/kg. These are standard weight-based regimens; a flat mg "max" is not
  clinically meaningful. **Not errors.**
- **Already capped, missed by the regex**: e.g. "dantrolene 2.5 mg/kg … to
  10 mg/kg", "70 mg/kg" with an absolute "5 g" alongside. **Not errors.**
- **Single pre-referral paediatric doses** (IMCI): ampicillin 50 mg/kg + gentamicin
  5 mg/kg (<7 d) / 7.5 mg/kg (≥7 d) — standard neonatal pre-referral dosing.
  **Not errors.**
- **Genuinely cappable paediatric repeat-dose drugs** (the small actionable set):
  paracetamol, ibuprofen, oral amoxicillin, ceftriaxone, azithromycin,
  prednisolone, etc. — for these, add the maxima below.

No incorrect dose VALUE was identified in the reviewed sample.

### Recommended maxima for the cappable subset (advisory — confirm vs national formulary)
| Drug | Per-kg | MAX cap |
|---|---|---|
| Paracetamol | 15 mg/kg/dose | 1 g/dose; 4 g/day |
| Ibuprofen | 10 mg/kg/dose | 400 mg/dose |
| Amoxicillin | 80–90 mg/kg/day | ~1 g/dose; 3 g/day |
| Ceftriaxone | 50–80 mg/kg/day | 2 g/day (4 g meningitis) |
| Azithromycin | 10 mg/kg/dose | 500 mg/dose |
| Prednisolone | 1–2 mg/kg/day | 40–60 mg/day |
| Adrenaline IM | 0.01 mg/kg | 0.5 mg/dose (0.3 mg <6 yr) |
| Diazepam IV | 0.2–0.3 mg/kg | 10 mg/dose |

## 4. Immunization / notifiable / preventive-care / referral — low acute-harm reference
Schedules and lists are WHO/IDSR-aligned reference data. Per-country specifics
flagged to verify (TZ 4/8/12-week primary series; SA EPI-SA distinct schedule +
NMC framework; NG Lassa/yellow-fever notifiables). No dangerous content found.

## Conclusion & recommendation
1. The dose linter's category B should be read as **"per-kg dose without an
   explicit max (for review)"**, not "overdose risk" — relabelled accordingly.
2. The genuinely actionable work is small: add the maxima above to the handful of
   paediatric repeat-dose drugs (clinician-confirmed), then re-sign.
3. For assurance at scale, run the full independent pass: `ANTHROPIC_API_KEY=…
   npm run validate:claude` (every record, fails on 'error' verdicts).
