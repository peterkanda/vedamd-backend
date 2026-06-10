# Parity matrix — 9 anglophone countries toward Kenya level

_Generated 2026-06-10 by `npm run parity:matrix`. Goal: every country supported
to the same level as Kenya._

## Parity model

Most clinical content is universal and is authored ONCE as the WHO baseline,
which every country inherits. National overlays are authored only for genuinely
country-divergent topics (EML drug choices, immunization schedules, national
HIV/TB/malaria protocols). A country reaches Kenya-level parity when the WHO
baseline + its national overlays cover the Kenya domain set and are clinically
signed off.

## WHO baseline layer (inherited by all countries, draft)

| Domain | Records | Status | Inherited by |
|---|---|---|---|
| `antimicrobial-stewardship` | 1 | draft | all 9 countries |
| `dosing-safety` | 1 | draft | all 9 countries |
| `drug-interactions` | 1 | draft | all 9 countries |
| `etat-triage` | 1 | draft | all 9 countries |
| `family-planning` | 1 | draft | all 9 countries |
| `hiv-art` | 1 | draft | all 9 countries |
| `immunization-schedule` | 1 | draft | all 9 countries |
| `malaria` | 1 | draft | all 9 countries |
| `mhgap-mental-health` | 1 | draft | all 9 countries |
| `ncd-diabetes` | 1 | draft | all 9 countries |
| `ncd-hypertension` | 1 | draft | all 9 countries |
| `tuberculosis` | 1 | draft | all 9 countries |

## Country status

| Country | Locale profile | Baseline domains inherited | National overlays | Sign-off |
|---|---|---|---|---|
| ET | ✅ | 12 (draft) | 0 | 🟡 in-progress |
| GH | ✅ | 12 (draft) | 0 | 🟡 in-progress |
| MW | ✅ | 12 (draft) | 0 | 🟡 in-progress |
| NG | ✅ | 12 (draft) | 0 | 🟡 in-progress |
| RW | ✅ | 12 (draft) | 0 | 🟡 in-progress |
| TZ | ✅ | 12 (draft) | 0 | 🟡 in-progress |
| UG | ✅ | 12 (draft) | 0 | 🟡 in-progress |
| ZA | ✅ | 12 (draft) | 0 | 🟡 in-progress |
| ZM | ✅ | 12 (draft) | 0 | 🟡 in-progress |

## Kenya parity target (signed-bundle domains)

The full domain set a country must cover (via baseline + national overlay) to
reach Kenya level:

- `allergy-cross-reactivity`
- `anticoagulant-reversal`
- `antidotes`
- `bedside-interpretation`
- `cds-rules`
- `clinical-procedures`
- `clinical-scores`
- `conditions`
- `drug-disease-interactions`
- `drug-interactions`
- `drugs`
- `growth-development`
- `hepatic-dose`
- `immunization-schedule`
- `iv-compatibility`
- `notifiable-diseases`
- `pharmacogenomics`
- `pregnancy-lactation`
- `preventive-care`
- `procedures`
- `reference-ranges`
- `renal-dose`
- `symptom-triage`
- `terminology`
- `toxidromes`

_Baseline domains authored so far: 12 / target 25. National
clinical authoring + clinical sign-off remain the gate to flipping any country
to `localized`._
