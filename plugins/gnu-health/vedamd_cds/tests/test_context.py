"""Tests for the GNU Health -> VedaMD context mapping.

Runs without Tryton: context.py deliberately has no ORM imports.
"""

import sys
import unittest
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from context import age_in_years, build_context  # noqa: E402


class AgeTests(unittest.TestCase):
    def test_whole_years(self):
        self.assertEqual(age_in_years(date(1980, 3, 4), date(2026, 9, 12)), 46)

    def test_birthday_not_yet_reached(self):
        self.assertEqual(age_in_years(date(1980, 12, 4), date(2026, 9, 12)), 45)

    def test_future_date_of_birth_is_rejected(self):
        self.assertIsNone(age_in_years(date(2030, 1, 1), date(2026, 9, 12)))

    def test_missing_dob(self):
        self.assertIsNone(age_in_years(None))


class BuildContextTests(unittest.TestCase):
    def test_maps_the_basics(self):
        ctx = build_context(
            patient_age_years=46,
            patient_sex='f',
            draft_medications=['Warfarin', 'Ibuprofen'],
        )
        self.assertEqual(ctx['ageYears'], 46)
        self.assertEqual(ctx['sex'], 'female')
        self.assertEqual(ctx['draftMedications'], ['Warfarin', 'Ibuprofen'])
        self.assertEqual(ctx['medications'], ['Warfarin', 'Ibuprofen'])

    def test_gnu_health_single_letter_gender(self):
        self.assertEqual(build_context(patient_sex='m')['sex'], 'male')
        self.assertEqual(build_context(patient_sex='F')['sex'], 'female')

    def test_unknown_gender_is_omitted_not_guessed(self):
        self.assertNotIn('sex', build_context(patient_sex='u'))

    def test_under_fives_also_get_months(self):
        self.assertEqual(build_context(patient_age_years=3)['ageMonths'], 36)
        self.assertNotIn('ageMonths', build_context(patient_age_years=30))

    def test_implausible_values_are_dropped(self):
        # A wrong weight halves or doubles every weight-based dose.
        self.assertNotIn('weightKg', build_context(weight_kg=0))
        self.assertNotIn('weightKg', build_context(weight_kg=900))
        self.assertEqual(build_context(weight_kg=62.5)['weightKg'], 62.5)
        self.assertNotIn('ageYears', build_context(patient_age_years=200))

    def test_conditions_carry_icd10_and_label(self):
        ctx = build_context(conditions=['ICD10:I48.0', 'Atrial Fibrillation'])
        self.assertEqual(ctx['diagnoses'], ['ICD10:I48.0', 'atrial fibrillation'])

    def test_current_and_draft_merge_without_duplicates(self):
        ctx = build_context(medications=['Warfarin'], draft_medications=['warfarin', 'Ibuprofen'])
        self.assertEqual(len(ctx['medications']), 2)

    def test_empty_input_produces_empty_context(self):
        self.assertEqual(build_context(), {})


if __name__ == '__main__':
    unittest.main()


class ModelMappingTests(unittest.TestCase):
    """Exercises vedamd_build_context against GNU Health 5.0 field names,
    with Tryton stubbed so the module imports without a pool."""

    @classmethod
    def setUpClass(cls):
        import types
        pool = types.ModuleType('trytond.pool')

        class PoolMeta(type):
            pass

        pool.PoolMeta = PoolMeta
        pool.Pool = object
        model = types.ModuleType('trytond.model')

        model.ModelSingleton = type('ModelSingleton', (), {})
        model.ModelSQL = type('ModelSQL', (), {})
        model.ModelView = type('ModelView', (), {})
        model.fields = types.SimpleNamespace(
            Boolean=lambda *a, **k: None, Char=lambda *a, **k: None,
            Integer=lambda *a, **k: None)
        transaction = types.ModuleType('trytond.transaction')
        transaction.Transaction = object
        trytond = types.ModuleType('trytond')
        for name, mod in {'trytond': trytond, 'trytond.pool': pool,
                          'trytond.model': model, 'trytond.transaction': transaction}.items():
            sys.modules[name] = mod

        # Load health_vedamd as part of a package so its relative imports work.
        import importlib.util
        root = Path(__file__).resolve().parents[1]
        pkg = types.ModuleType('vedamd_cds')
        pkg.__path__ = [str(root)]
        sys.modules['vedamd_cds'] = pkg
        for sub in ('context', 'health_vedamd'):
            spec = importlib.util.spec_from_file_location('vedamd_cds.' + sub, root / (sub + '.py'))
            mod = importlib.util.module_from_spec(spec)
            sys.modules['vedamd_cds.' + sub] = mod
            spec.loader.exec_module(mod)
        cls.Order = sys.modules['vedamd_cds.health_vedamd'].PatientPrescriptionOrder

    def test_reads_verified_gnu_health_fields(self):
        from types import SimpleNamespace as NS
        warfarin = NS(active_component='Warfarin', rec_name='Warfarin 5 mg tablet')
        ibuprofen = NS(active_component='', rec_name='Ibuprofen 400 mg tablet')
        patient = NS(
            dob=date(1955, 1, 1),
            gender='f',
            medications=[NS(is_active=True, medicament=warfarin),
                         NS(is_active=False, medicament=NS(active_component='Digoxin', rec_name='x'))],
            diseases=[NS(is_active=True, pathology=NS(code='I48.0', name='Atrial fibrillation')),
                      NS(is_active=False, pathology=NS(code='J18.9', name='Pneumonia'))],
        )
        order = NS(patient=patient, prescription_line=[NS(medicament=ibuprofen)])

        ctx = self.Order.vedamd_build_context(order)

        self.assertEqual(ctx['sex'], 'female')
        self.assertGreaterEqual(ctx['ageYears'], 70)
        self.assertEqual(ctx['draftMedications'], ['Ibuprofen 400 mg tablet'])
        # Active current medication included; discontinued digoxin excluded.
        self.assertEqual(ctx['medications'], ['Warfarin', 'Ibuprofen 400 mg tablet'])
        # Active disease included; healed pneumonia excluded.
        self.assertIn('ICD10:I48.0', ctx['diagnoses'])
        self.assertNotIn('ICD10:J18.9', [d.upper() for d in ctx['diagnoses']])
        self.assertNotIn('weightKg', ctx)
