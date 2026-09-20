"""Maps GNU Health prescription data into a VedaMD clinical context.

Kept free of Tryton imports so the mapping can be tested without a
running Tryton pool — the module below passes plain values in.
"""

from datetime import date


def build_context(patient_age_years=None, patient_sex=None, medications=None,
                  draft_medications=None, conditions=None, allergies=None,
                  weight_kg=None):
    """Returns the VedaMD flat clinical context.

    Every argument is optional. Fields that are absent are simply not
    sent: VedaMD skips a rule whose inputs are missing, which is the
    safe direction. A fabricated default would make it fire wrongly.
    """
    context = {}

    if isinstance(patient_age_years, int) and 0 <= patient_age_years < 130:
        context['ageYears'] = patient_age_years
        if patient_age_years < 5:
            context['ageMonths'] = patient_age_years * 12

    if isinstance(patient_sex, str):
        sex = _normalise_sex(patient_sex)
        if sex:
            context['sex'] = sex

    if isinstance(weight_kg, (int, float)) and 0.3 <= weight_kg <= 400:
        context['weightKg'] = round(float(weight_kg), 2)

    all_medications = _clean_list(medications) + _clean_list(draft_medications)
    if all_medications:
        context['medications'] = _unique(all_medications)

    drafts = _clean_list(draft_medications)
    if drafts:
        context['draftMedications'] = _unique(drafts)

    cleaned_conditions = _clean_list(conditions)
    if cleaned_conditions:
        # Lowercase free-text labels for substring matching, but keep coded
        # entries ("ICD10:I48.0") exactly as the terminology spells them.
        context['diagnoses'] = _unique(
            [c if ':' in c else c.lower() for c in cleaned_conditions])

    cleaned_allergies = _clean_list(allergies)
    if cleaned_allergies:
        context['allergies'] = _unique(cleaned_allergies)

    return context


def age_in_years(dob, today=None):
    """Whole years between `dob` and `today`, or None when unknown."""
    if not isinstance(dob, date):
        return None
    today = today or date.today()
    if dob > today:
        return None
    years = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        years -= 1
    return years


def _normalise_sex(value):
    # GNU Health 5.0 gender selection: m, f, nb, other. Only m/f map to
    # the sex-specific rules; anything else is omitted, not guessed.
    mapping = {'m': 'male', 'male': 'male', 'f': 'female', 'female': 'female'}
    return mapping.get(value.strip().lower())


def _clean_list(values):
    if not values:
        return []
    out = []
    for value in values:
        if value is None:
            continue
        text = str(value).strip()
        if text:
            out.append(text)
    return out


def _unique(items):
    seen = set()
    out = []
    for item in items:
        key = item.lower()
        if key not in seen:
            seen.add(key)
            out.append(item)
    return out
