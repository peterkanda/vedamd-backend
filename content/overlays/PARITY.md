# Parity matrix — 9 anglophone countries toward Kenya level

_Generated 2026-06-13 by `npm run parity:matrix`. Goal: every country supported
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
| ET | ✅ | 12 (draft) | 3 | 🟡 in-progress |
| GH | ✅ | 12 (draft) | 3 | 🟡 in-progress |
| MW | ✅ | 12 (draft) | 3 | 🟡 in-progress |
| NG | ✅ | 12 (draft) | 3 | 🟡 in-progress |
| RW | ✅ | 12 (draft) | 3 | 🟡 in-progress |
| TZ | ✅ | 12 (draft) | 3 | 🟡 in-progress |
| UG | ✅ | 12 (draft) | 3 | 🟡 in-progress |
| ZA | ✅ | 12 (draft) | 3 | 🟡 in-progress |
| ZM | ✅ | 12 (draft) | 3 | 🟡 in-progress |

## Kenya parity target (signed-bundle domains)

Each domain reaches parity one of two ways — **universal** content is inherited
by every country once the baseline is promoted; **national-divergent / mixed**
content needs a per-country overlay.

| Domain | Path to parity |
|---|---|
| `allergy-cross-reactivity` | universal |
| `anticoagulant-reversal` | universal |
| `antidotes` | universal |
| `bedside-interpretation` | universal |
| `cds-rules` | mixed |
| `clinical-procedures` | universal |
| `clinical-scores` | universal |
| `conditions` | mixed |
| `drug-disease-interactions` | universal |
| `drug-interactions` | universal |
| `drugs` | national-divergent |
| `growth-development` | universal |
| `hepatic-dose` | universal |
| `immunization-schedule` | national-divergent |
| `iv-compatibility` | universal |
| `notifiable-diseases` | national-divergent |
| `pharmacogenomics` | universal |
| `pregnancy-lactation` | universal |
| `preventive-care` | mixed |
| `procedures` | universal |
| `reference-ranges` | universal |
| `renal-dose` | universal |
| `symptom-triage` | mixed |
| `terminology` | universal |
| `toxidromes` | universal |

## Parity summary

- **18 of 25** Kenya domains are **universal** — inheritable by all 9 countries once the baseline is promoted (no per-country authoring).
- **7 of 25** are **national-divergent / mixed** — these are the focused per-country authoring backlog (EML drug choices, immunization schedules, notifiable lists, national first-line protocols).
- WHO baseline topic-domains authored so far: **12** (draft).

_National clinical authoring + clinical sign-off remain the gate to flipping any
country to `localized`._
