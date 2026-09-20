"""Builds a VedaMD clinical context from Frappe Health documents.

Field names here are taken from the Frappe Health DocType schemas, not
from memory:

    Patient Encounter  patient, patient_age, patient_sex,
                       drug_prescription (Table -> Drug Prescription),
                       codification_table (Table -> Codification Table),
                       diagnosis (Table MultiSelect), symptoms
    Drug Prescription  drug_code (Link -> Item), drug_name, medication,
                       dosage, period, strength, strength_uom
    Patient            dob, sex, allergies, medication, medical_history
    Codification Table code_system, code, display, code_value

Nothing here transmits a patient identifier, name, or free-text note.
"""

import re

# "45 Year(s) 3 Month(s)" — the string Frappe Health puts in patient_age.
_AGE_YEARS = re.compile(r"(\d+)\s*Year", re.IGNORECASE)
_AGE_MONTHS = re.compile(r"(\d+)\s*Month", re.IGNORECASE)
_AGE_DAYS = re.compile(r"(\d+)\s*Day", re.IGNORECASE)


def build_context(encounter, patient=None):
    """Returns the VedaMD flat clinical context for one encounter.

    `encounter` and `patient` are Frappe documents (or any object with
    the same attributes), so this function stays unit-testable without
    a running Frappe site.
    """
    context = {}

    _add_demographics(encounter, patient, context)
    _add_medications(encounter, patient, context)
    _add_diagnoses(encounter, context)
    _add_allergies(patient, context)

    return context


def _add_demographics(encounter, patient, context):
    age = _parse_age(getattr(encounter, "patient_age", None))
    context.update(age)

    sex = getattr(encounter, "patient_sex", None) or getattr(patient, "sex", None)
    if isinstance(sex, str):
        normalised = sex.strip().lower()
        if normalised in ("male", "female"):
            context["sex"] = normalised


def _parse_age(age_string):
    """Parses Frappe's human-readable age string into numeric fields.

    Returns an empty dict when the string is absent or unparseable —
    a wrong age silently changes which paediatric rules fire, so a
    missing value is strictly better than a guessed one.
    """
    if not isinstance(age_string, str):
        return {}

    years = _AGE_YEARS.search(age_string)
    months = _AGE_MONTHS.search(age_string)
    days = _AGE_DAYS.search(age_string)

    out = {}
    if years:
        out["ageYears"] = int(years.group(1))
    if months:
        total_months = int(months.group(1)) + (out.get("ageYears", 0) * 12)
        # Only meaningful for the under-fives, where the paediatric
        # rules branch on months rather than years.
        if out.get("ageYears", 0) < 5:
            out["ageMonths"] = total_months
    elif "ageYears" in out and out["ageYears"] < 5:
        out["ageMonths"] = out["ageYears"] * 12
    if days and not years and not months:
        out["ageDays"] = int(days.group(1))
        out.setdefault("ageYears", 0)

    return out


def _add_medications(encounter, patient, context):
    medications = []

    for line in getattr(encounter, "drug_prescription", None) or []:
        name = _first_text(
            getattr(line, "drug_name", None),
            getattr(line, "medication", None),
            getattr(line, "drug_code", None),
        )
        if name:
            medications.append(name)

    # Patient.medication is a free-text field sites use for the standing
    # medication list. One item per line is the convention; anything
    # VedaMD cannot resolve is reported back, not silently dropped.
    standing = getattr(patient, "medication", None)
    if isinstance(standing, str):
        medications.extend(_split_lines(standing))

    if medications:
        context["medications"] = _unique(medications)
        # The drugs being prescribed right now are the draft order —
        # this is what the prescribing-safety rules check against the
        # rest of the list.
        drafts = [
            _first_text(
                getattr(line, "drug_name", None),
                getattr(line, "medication", None),
                getattr(line, "drug_code", None),
            )
            for line in getattr(encounter, "drug_prescription", None) or []
        ]
        drafts = [d for d in drafts if d]
        if drafts:
            context["draftMedications"] = _unique(drafts)


def _add_diagnoses(encounter, context):
    diagnoses = []

    for row in getattr(encounter, "codification_table", None) or []:
        # A coded diagnosis is worth far more than its label; send both
        # as "SYSTEM:CODE" plus the display text.
        code = getattr(row, "code", None)
        system = getattr(row, "code_system", None)
        display = getattr(row, "display", None) or getattr(row, "code_value", None)
        if code and system:
            diagnoses.append(f"{system}:{code}")
        if display:
            diagnoses.append(str(display).lower())

    for row in getattr(encounter, "diagnosis", None) or []:
        label = getattr(row, "diagnosis", None) or getattr(row, "name", None)
        if label:
            diagnoses.append(str(label).lower())

    if diagnoses:
        context["diagnoses"] = _unique(diagnoses)


def _add_allergies(patient, context):
    allergies = getattr(patient, "allergies", None)
    if isinstance(allergies, str):
        parsed = _split_lines(allergies)
        if parsed:
            context["allergies"] = _unique(parsed)


def _split_lines(text):
    """Splits a Small Text field into items on newlines or commas."""
    items = []
    for chunk in re.split(r"[\n,;]+", text or ""):
        cleaned = re.sub(r"<[^>]+>", " ", chunk).strip()
        if cleaned:
            items.append(cleaned)
    return items


def _first_text(*values):
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _unique(items):
    seen = set()
    out = []
    for item in items:
        key = item.lower() if isinstance(item, str) else item
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out
