# VedaMD Clinical Decision Support for OpenEMR

Adds a **VedaMD Decision Support** card to the OpenEMR patient dashboard
with safety findings — drug interactions, renal and hepatic dose
adjustment, pregnancy safety, allergy cross-reactivity, WHO AWaRe
stewardship — built from the patient's own medication list, problem
list, allergies and latest vitals.

The card only appears when VedaMD has something to say. A patient with
no findings gets no empty box.

## Why a module and not CDS Hooks

OpenEMR has **no CDS Hooks client.** It ships a Clinical Decision Rules
(CDR) engine (`library/clinical_rules.php`, `src/ClinicalDecisionRules/`)
whose rules are local database records, plus FHIR R4 and SMART on FHIR
for outbound data. Nothing in it calls a remote CDS Hooks service.

So this module *is* the CDS Hooks client: it reads the chart, calls
VedaMD, and renders the cards. Any documentation claiming you can paste
a discovery URL into **Globals → Connectors** is describing a feature
OpenEMR does not have.

## Requirements

- OpenEMR 7.0 or newer (module event system, Twig card rendering)
- PHP 8.1+ with `curl` and `json`
- Outbound HTTPS to your VedaMD endpoint

## Install

```bash
cd /var/www/openemr/interface/modules/custom_modules
unzip /path/to/vedamd-openemr-<version>.zip
# creates oe-module-vedamd-cds/ — keep that folder name
chown -R www-data:www-data oe-module-vedamd-cds
```

Then **Administration → Modules → Manage Modules**, find *VedaMD Clinical
Decision Support*, and click **Register**, **Install**, **Enable**.

## Configure

Environment variables take precedence — the right place for a secret in
a containerised deployment:

```bash
VEDAMD_API_KEY=vmd_live_xxxxxxxx
VEDAMD_BASE_URL=https://api.vedamd.io
VEDAMD_SERVICE_ID=vedamd-order-select
VEDAMD_TIMEOUT_SECONDS=4
```

Sites without shell access can set the equivalent OpenEMR globals:
`vedamd_api_key`, `vedamd_base_url`, `vedamd_service_id`, and
`vedamd_dashboard_section` (`secondary`, the default, or `primary`).

**Which service.** The default, `vedamd-order-select`, runs the
prescribing-safety rules: interactions, renal/hepatic dosing, pregnancy,
allergy cross-reactivity and stewardship. `vedamd-patient-view` runs
monitoring and screening rules instead and does **not** return drug
interaction cards — for a warfarin + ibuprofen patient it returns
monitoring reminders but not the severe interaction. Choose it only if
you want reminders rather than prescribing safety on the dashboard.

## Where the card appears

`interface/patient_file/summary/demographics.php` dispatches
`SectionEvent('primary')` and `SectionEvent('secondary')` and renders
every card listeners add. The module adds its card to one of those
sections, gated on the same ACL as the core medical cards
(`patients` / `med`) — users who cannot see medications do not see it.

An earlier version tried to append to a "medications" card. OpenEMR
never dispatches a card event with that id — the medication card is
rendered directly — so that version installed cleanly and never showed
anything. Adding a card of our own removes the dependency on a core
card's internal id.

## What gets sent

Read [`src/PatientContextBuilder.php`](src/PatientContextBuilder.php) for
the full mapping. In summary:

| Source | Sent as |
|---|---|
| `patient_data.DOB`, `.sex` | `ageYears` / `ageMonths` / `ageDays`, `sex` |
| `prescriptions` (active) | `medications`, with RxNorm where recorded |
| `lists` type `medication` | appended to `medications` |
| `lists` type `medical_problem` | `diagnoses`, including `ICD10:` codes |
| `lists` type `allergy` | `allergies` |
| `form_vitals` (latest) | `systolicMmHg`, `diastolicMmHg`, `heartRatePerMin`, `respiratoryRatePerMin`, `oxygenSatPercent`, `weightKg`, `heightCm`, `bodyTempC` |

No patient identifier, name, address or note text is transmitted.

### Units

OpenEMR stores vitals in **US customary** units no matter what
`units_of_measurement` is set to for display: weight in pounds, height
in inches, temperature in Fahrenheit. The module converts to metric
before sending.

This matters clinically. A 70 kg adult sent as "70" unconverted becomes
31.8 kg to the engine, which halves every weight-based paediatric dose
it calculates. If you fork the context builder, keep the conversions.

Values of `0` are treated as "not recorded", because that is what
OpenEMR writes for an unfilled vitals field — and a blood pressure of 0
would otherwise read as profound shock.

## Failure behaviour

If VedaMD is unreachable, slow, or returns an error, the module renders
**nothing** and logs the failure class to the PHP error log. The chart
always renders. A decision-support outage is not a reason to block a
clinician from seeing the patient, and an error banner in a clinical
screen is something staff learn to dismiss on sight.

## Security

- The API key is never written to the page or to the browser.
- Only failure classes are logged — never the payload or card text.
- **OpenEMR runs Twig with autoescaping disabled**
  (`src/Common/Twig/TwigContainer.php`: `['autoescape' => false]`). The
  card template therefore escapes every value explicitly with OpenEMR's
  own `|text` and `|attr` filters and every link with `|safe_href` — the
  same filters core templates use. Do not remove them when customising.
- Source links are additionally restricted to `http`/`https` before they
  reach the template.

## Status

Written against OpenEMR APIs and schema verified in the OpenEMR source:
`section.render` / `SectionEvent`, `CardModel`, `core.twig.environment.create`,
the `patient/card/card_base.html.twig` frame, the `text` / `attr` /
`safe_href` Twig filters, and the `patient_data`, `prescriptions`, `lists`
and `form_vitals` tables.

It has **not yet been executed against a running OpenEMR instance.**
Install it in staging and open a patient with an active warfarin
prescription plus ibuprofen before enabling it in a clinic.
