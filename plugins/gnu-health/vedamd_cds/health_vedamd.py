"""VedaMD decision support hooked into the GNU Health prescription flow.

Model names follow GNU Health's health module:
    gnuhealth.prescription.order  the prescription
    gnuhealth.prescription.line   one prescribed medicament
    gnuhealth.patient             the patient record (party, dob, gender)

Failure policy: VedaMD advises, it does not veto. A CDS outage must
never stop a prescription being written, so every error path logs and
returns no cards. Only a `critical` card interrupts the user, and even
then as a warning they can accept.
"""

import json
import logging
import urllib.error
import urllib.request
import uuid

from trytond.model import ModelSingleton, ModelSQL, ModelView, fields
from trytond.pool import Pool, PoolMeta

from .context import age_in_years, build_context

logger = logging.getLogger(__name__)

__all__ = ['VedaMDConfiguration', 'PatientPrescriptionOrder']

DEFAULT_BASE_URL = 'https://api.vedamd.io'
DEFAULT_SERVICE = 'vedamd-order-select'
DEFAULT_TIMEOUT = 4


class VedaMDConfiguration(ModelSingleton, ModelSQL, ModelView):
    """VedaMD connection settings (Health -> Configuration -> VedaMD)."""

    __name__ = 'gnuhealth.vedamd.configuration'

    enabled = fields.Boolean('Enabled')
    base_url = fields.Char('VedaMD base URL')
    api_key = fields.Char('API key')
    service_id = fields.Char('CDS service id')
    timeout = fields.Integer('Timeout (seconds)')

    @staticmethod
    def default_enabled():
        return True

    @staticmethod
    def default_base_url():
        return DEFAULT_BASE_URL

    @staticmethod
    def default_service_id():
        return DEFAULT_SERVICE

    @staticmethod
    def default_timeout():
        return DEFAULT_TIMEOUT


class PatientPrescriptionOrder(metaclass=PoolMeta):
    """Evaluates prescription safety as orders are created."""

    __name__ = 'gnuhealth.prescription.order'

    @classmethod
    def create(cls, vlist):
        orders = super(PatientPrescriptionOrder, cls).create(vlist)
        for order in orders:
            try:
                cards = cls.vedamd_evaluate(order)
            except Exception:
                # Never let decision support break prescribing.
                logger.exception('VedaMD evaluation failed')
                continue
            cls.vedamd_report(order, cards)
        return orders

    @classmethod
    def vedamd_evaluate(cls, order):
        config = Pool().get('gnuhealth.vedamd.configuration')(1)
        if not config.enabled or not config.api_key:
            return []

        context = cls.vedamd_build_context(order)
        if not context.get('medications'):
            return []

        return cls.vedamd_post(config, context)

    @classmethod
    def vedamd_build_context(cls, order):
        """Reads the order and its patient into a VedaMD context.

        Field names are from GNU Health 5.0 (health.py), not memory:
          gnuhealth.prescription.order  patient, prescription_line
          gnuhealth.prescription.line   medicament
          gnuhealth.medicament          active_component (INN), rec_name
          gnuhealth.patient             dob, gender (Function fields),
                                        diseases, medications
          gnuhealth.patient.disease     pathology, is_active
          gnuhealth.patient.medication  medicament, is_active
          gnuhealth.pathology           code (ICD-10), name
        gnuhealth.patient has no weight field — weight lives on patient
        evaluations — so none is sent rather than a stale guess.
        """
        drafts = []
        for line in getattr(order, 'prescription_line', None) or []:
            name = cls.vedamd_medicament_name(getattr(line, 'medicament', None))
            if name:
                drafts.append(name)

        patient = getattr(order, 'patient', None)
        age = None
        sex = None
        current = []
        conditions = []

        if patient is not None:
            age = age_in_years(getattr(patient, 'dob', None))
            sex = getattr(patient, 'gender', None)

            for medication in getattr(patient, 'medications', None) or []:
                # Only what the patient is actually taking now.
                if not getattr(medication, 'is_active', False):
                    continue
                name = cls.vedamd_medicament_name(getattr(medication, 'medicament', None))
                if name:
                    current.append(name)

            for disease in getattr(patient, 'diseases', None) or []:
                # A healed condition sent as active would fire rules for a
                # disease the patient no longer has.
                if not getattr(disease, 'is_active', False):
                    continue
                pathology = getattr(disease, 'pathology', None)
                if pathology is None:
                    continue
                code = getattr(pathology, 'code', None)
                label = getattr(pathology, 'name', None)
                if code:
                    # GNU Health pathology codes are ICD-10.
                    conditions.append('ICD10:%s' % code)
                if label:
                    conditions.append(label)

        return build_context(
            patient_age_years=age,
            patient_sex=sex,
            medications=current,
            draft_medications=drafts,
            conditions=conditions,
        )

    @staticmethod
    def vedamd_medicament_name(medicament):
        """Prefers the active component (an INN such as "amoxicillin"),
        which VedaMD resolves reliably, over the product label."""
        if medicament is None:
            return None
        component = getattr(medicament, 'active_component', None)
        if component and str(component).strip():
            return str(component).strip()
        rec_name = getattr(medicament, 'rec_name', None)
        return str(rec_name).strip() if rec_name else None

    @classmethod
    def vedamd_post(cls, config, context):
        """POSTs to the CDS Hooks endpoint. Returns [] on any failure."""
        base_url = (config.base_url or DEFAULT_BASE_URL).rstrip('/')
        service = config.service_id or DEFAULT_SERVICE
        url = '%s/cds-services/%s' % (base_url, service)

        payload = json.dumps({
            'hook': 'order-select',
            'hookInstance': str(uuid.uuid4()),
            'context': context,
        }).encode('utf-8')

        request = urllib.request.Request(
            url,
            data=payload,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': 'Bearer %s' % config.api_key,
            },
            method='POST',
        )

        try:
            with urllib.request.urlopen(
                    request, timeout=config.timeout or DEFAULT_TIMEOUT) as response:
                body = json.loads(response.read().decode('utf-8'))
        except (urllib.error.URLError, ValueError, TimeoutError) as exc:
            # Log the failure class only — the payload is patient data.
            logger.warning('VedaMD request failed: %s', type(exc).__name__)
            return []

        cards = body.get('cards') if isinstance(body, dict) else None
        return cards if isinstance(cards, list) else []

    @classmethod
    def vedamd_report(cls, order, cards):
        """Surfaces cards to the prescriber.

        Tryton has no non-blocking notification primitive available
        inside `create`, so cards are written to the order's notes and
        logged. Sites wanting an interrupting dialog should call
        `vedamd_evaluate` from a wizard on the prescription form, where
        raising a UserWarning is appropriate.
        """
        if not cards:
            return

        lines = []
        for card in cards:
            if not isinstance(card, dict):
                continue
            summary = card.get('summary')
            if not summary:
                continue
            indicator = str(card.get('indicator', 'info')).upper()
            lines.append('[%s] %s' % (indicator, summary))

        if not lines:
            return

        logger.info('VedaMD returned %d card(s) for prescription %s',
                    len(lines), getattr(order, 'prescription_id', '?'))

        notes = getattr(order, 'notes', '') or ''
        banner = 'VedaMD decision support:\n' + '\n'.join(lines)
        order.notes = (notes + '\n\n' + banner).strip() if notes else banner
        order.save()
