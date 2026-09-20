# VedaMD Clinical Decision Support for Frappe Health

A Frappe app that calls VedaMD when a **Patient Encounter** with
prescriptions is saved, and shows the resulting safety cards to the
prescriber.

Requires Frappe v15 with the **Frappe Health** (`healthcare`) app installed.

## Install from the downloaded package

```bash
cd ~/frappe-bench/apps
unzip /path/to/vedamd-frappe-<version>.zip      # creates apps/vedamd_cds/
cd ~/frappe-bench
bench pip install -e apps/vedamd_cds
echo "vedamd_cds" >> sites/apps.txt             # check the file ends with a newline first
bench --site your-site.local install-app vedamd_cds
bench restart
```

## Configure

Put the key in `site_config.json`, not in a DocType, so it stays out of
database backups:

```bash
bench --site your-site.local set-config vedamd_api_key "vmd_live_xxxxxxxx"
bench --site your-site.local set-config vedamd_base_url "https://api.vedamd.io"
# optional
bench --site your-site.local set-config vedamd_service_id "vedamd-order-select"
bench --site your-site.local set-config vedamd_timeout 4
bench --site your-site.local set-config vedamd_enabled 0   # switch off without uninstalling
```

## What gets sent

Mapped in [`vedamd_cds/context.py`](vedamd_cds/context.py) from Frappe
Health fields verified against the DocType schemas:

| Frappe Health | VedaMD context |
|---|---|
| `Patient Encounter.patient_age` | `ageYears`, `ageMonths` (under-fives) |
| `Patient Encounter.patient_sex` | `sex` |
| `Drug Prescription.drug_name` / `.medication` / `.drug_code` | `draftMedications`, `medications` |
| `Patient.medication` | appended to `medications` |
| `Patient.allergies` | `allergies` |
| `Codification Table.code` + `.code_system` | `diagnoses` (as `ICD-10:E11.9`) |

VedaMD resolves the drug names as the EMR stores them — "Warfarin 5mg"
matches warfarin. No patient id, name or note text is sent.

## Behaviour

- Runs on `validate`, only when the encounter has prescriptions.
- Critical cards interrupt as a dialog; everything else is a passive alert.
- **Saving is never blocked.** Every failure — timeout, bad key, VedaMD
  down — is logged to the Error Log and the save continues.

## Server Scripts instead of an app

If you paste this logic into a Server Script rather than installing the
app, note two differences from app code:

- `import requests` is blocked by RestrictedPython. Use
  `frappe.integrations.utils.make_post_request`.
- That helper's signature (v15) is
  `make_request(method, url, auth, headers, data, json, params)` — it has
  **no timeout parameter**. Passing `timeout=` raises `TypeError`. The app
  avoids the helper for exactly this reason.

## Tests

```bash
python3 -m unittest discover -s tests
```

The tests stub `frappe` and `requests`, so they run without a bench.
