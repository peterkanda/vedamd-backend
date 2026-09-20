# VedaMD Clinical Decision Support for DHIS2

A DHIS2 app that runs VedaMD safety checks against a Tracker record's
attributes and event data. **No build step** — upload the downloaded zip
as-is.

## Why an app, not a program rule

DHIS2 program rules **cannot call an external service.** Their action
types — assign value, display text, display key/value pair, error on
complete, hide field, hide section, prevent adding events, make field
mandatory, show error, show warning, warning on complete, send message,
schedule message — never reach the network. Program-notification
webhooks are fire-and-forget: the response never returns to the form.

## Install

1. **Deploy the CDS bridge** (separate download) inside your network,
   with your DHIS2 URL allowed for CORS:

   ```bash
   BRIDGE_ALLOWED_ORIGINS=https://dhis2.your-ministry.org
   ```

   The app runs in the browser, where no secret can be kept, so the API
   key lives in the bridge — never in the app.

2. **Upload the app**: *App Management → Install App* → choose
   `vedamd-dhis2-<version>.zip`. The zip has `manifest.webapp` at its
   root, as App Management requires.

3. **Save settings**: open the app. Until settings exist it shows the
   settings form. They are stored in the DHIS2 dataStore under namespace
   `vedamd` (reserved by the manifest), so every user shares one
   configuration.

## Mapping — there is no default

DHIS2 metadata uids are chosen per implementation, so any shipped
default would be wrong for your instance. The app refuses to run a check
until a mapping is saved.

*Load the Sierra Leone demo example* in Settings fills in a mapping
verified against the DHIS2 demo database:

| uid | DHIS2 object | VedaMD field |
|---|---|---|
| `cejWyOfXge6` | Attribute *Gender* (Male / Female) | `sex` |
| `qrur9Dvnyt5` | Data element *Age in years* | `ageYears` |
| `GieVkTxp4HH` | Data element *Height in cm* | `heightCm` |
| `vV9UWAZohSf` | Data element *Weight in kg* | `weightKg` |
| `M4HEOoEFTAT` | Data element *WHOMCH Systolic blood pressure* | `systolicMmHg` |
| `dyYdfamSY2Z` | Data element *WHOMCH Diastolic blood pressure* | `diastolicMmHg` |

Re-point every uid to your own metadata before use. Kenya KHIS,
Tanzania HMIS and Uganda HMIS2 all differ.

Each entry is `{ "uid", "field", "coerce", "min", "max", "values" }`:
`coerce` is `number`, `boolean`, `text` or `list`; `min`/`max` drop
physiologically impossible readings; `values` maps option-set codes to
VedaMD values. Unmapped data on a record is listed after each check.

## Which service

The default, `vedamd-patient-view`, runs screening and recognition rules
suited to Tracker programmes. If your mapping includes `medications`,
use `vedamd-order-select` — patient-view does not return drug
interaction cards.

## Compatibility

Uses `GET /api/tracker/trackedEntities/{uid}` with
`fields=attributes[attribute,value],enrollments[events[dataValues[dataElement,value]]]`.
That query was verified against the DHIS2 demo server (2.44). The
`/api/tracker` endpoints need DHIS2 2.41 or newer.

## Tests

```bash
npm test
```
