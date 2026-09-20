# VedaMD clinical decision support for GNU Health.
#
# GNU Health is a Tryton application, so the integration is a Tryton
# module: it extends the prescription model and calls VedaMD when a
# prescription is created.
#
# Note on FHIR: GNU Health's FHIR server (`gnuhealth-fhir-server`) is a
# separate, read-only Flask application maintained outside the GNU
# Health core, and has not tracked recent FHIR releases. Building this
# integration on it would mean depending on an unmaintained bridge for
# data the Tryton ORM already has in hand. Hence the direct approach.

from trytond.pool import Pool

from . import health_vedamd


def register():
    Pool.register(
        health_vedamd.VedaMDConfiguration,
        health_vedamd.PatientPrescriptionOrder,
        module='vedamd_cds', type_='model')
