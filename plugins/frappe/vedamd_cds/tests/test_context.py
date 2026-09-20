"""Tests for the Frappe Health -> VedaMD context mapping.

Runs without a Frappe installation: build_context takes plain objects,
so the mapping can be verified in isolation from the framework.
"""

import sys
import unittest
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from vedamd_cds.context import build_context, _parse_age  # noqa: E402


def encounter(**kwargs):
    defaults = {
        "patient": "PT-0001",
        "patient_age": "58 Year(s)",
        "patient_sex": "Female",
        "drug_prescription": [],
        "codification_table": [],
        "diagnosis": [],
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def drug(**kwargs):
    defaults = {"drug_name": None, "medication": None, "drug_code": None}
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class ParseAgeTests(unittest.TestCase):
    def test_parses_years(self):
        self.assertEqual(_parse_age("58 Year(s)"), {"ageYears": 58})

    def test_parses_months_for_under_fives(self):
        # Paediatric rules branch on months; a three-year-old must carry
        # both so IMCI rules with a months threshold can fire.
        parsed = _parse_age("3 Year(s) 2 Month(s)")
        self.assertEqual(parsed["ageYears"], 3)
        self.assertEqual(parsed["ageMonths"], 38)

    def test_omits_months_for_adults(self):
        self.assertNotIn("ageMonths", _parse_age("42 Year(s) 6 Month(s)"))

    def test_parses_a_newborn_in_days(self):
        parsed = _parse_age("12 Day(s)")
        self.assertEqual(parsed["ageDays"], 12)
        self.assertEqual(parsed["ageYears"], 0)

    def test_returns_nothing_it_cannot_parse(self):
        # A guessed age silently changes which rules fire.
        self.assertEqual(_parse_age("unknown"), {})
        self.assertEqual(_parse_age(None), {})


class BuildContextTests(unittest.TestCase):
    def test_maps_demographics(self):
        ctx = build_context(encounter())
        self.assertEqual(ctx["ageYears"], 58)
        self.assertEqual(ctx["sex"], "female")

    def test_prescribed_drugs_become_draft_and_full_lists(self):
        patient = SimpleNamespace(medication="Warfarin 5mg\nMetformin 500mg", allergies=None, sex=None)
        ctx = build_context(
            encounter(drug_prescription=[drug(drug_name="Ibuprofen 400mg")]),
            patient,
        )
        self.assertEqual(ctx["draftMedications"], ["Ibuprofen 400mg"])
        self.assertIn("Warfarin 5mg", ctx["medications"])
        self.assertIn("Ibuprofen 400mg", ctx["medications"])

    def test_falls_back_through_drug_name_medication_then_code(self):
        ctx = build_context(
            encounter(
                drug_prescription=[
                    drug(medication="Amoxicillin"),
                    drug(drug_code="ITEM-CEFTRIAXONE"),
                ]
            )
        )
        self.assertEqual(ctx["medications"], ["Amoxicillin", "ITEM-CEFTRIAXONE"])

    def test_codified_diagnoses_carry_both_code_and_label(self):
        row = SimpleNamespace(
            code="E11.9", code_system="ICD-10", display="Type 2 diabetes mellitus", code_value=None
        )
        ctx = build_context(encounter(codification_table=[row]))
        self.assertIn("ICD-10:E11.9", ctx["diagnoses"])
        self.assertIn("type 2 diabetes mellitus", ctx["diagnoses"])

    def test_allergies_split_on_newlines_and_commas(self):
        patient = SimpleNamespace(allergies="Penicillin, Sulfa\nPeanut", medication=None, sex=None)
        ctx = build_context(encounter(), patient)
        self.assertEqual(ctx["allergies"], ["Penicillin", "Sulfa", "Peanut"])

    def test_strips_html_from_small_text_fields(self):
        # Frappe Small Text fields can contain markup from the rich editor.
        patient = SimpleNamespace(allergies="<div>Penicillin</div>", medication=None, sex=None)
        ctx = build_context(encounter(), patient)
        self.assertEqual(ctx["allergies"], ["Penicillin"])

    def test_deduplicates_case_insensitively(self):
        patient = SimpleNamespace(medication="warfarin", allergies=None, sex=None)
        ctx = build_context(encounter(drug_prescription=[drug(drug_name="Warfarin")]), patient)
        self.assertEqual(len(ctx["medications"]), 1)

    def test_sends_no_patient_identifiers(self):
        # The context must carry clinical signals only — never the
        # patient id, name, or anything that identifies a person.
        ctx = build_context(encounter(), SimpleNamespace(medication=None, allergies=None, sex=None))
        serialised = repr(ctx)
        self.assertNotIn("PT-0001", serialised)
        self.assertNotIn("patient", ctx)

    def test_empty_encounter_produces_no_junk_fields(self):
        ctx = build_context(
            encounter(patient_age=None, patient_sex=None),
            SimpleNamespace(medication=None, allergies=None, sex=None),
        )
        self.assertEqual(ctx, {})


if __name__ == "__main__":
    unittest.main()
