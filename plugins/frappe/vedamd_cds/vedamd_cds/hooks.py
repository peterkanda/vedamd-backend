app_name = "vedamd_cds"
app_title = "VedaMD CDS"
app_publisher = "VedaMD"
app_description = "Surfaces VedaMD safety cards on Frappe Health clinical documents."
app_email = "support@vedamd.io"
app_license = "MIT"
required_apps = ["healthcare"]

# Fires when a clinician saves a Patient Encounter.
#
# `validate` rather than `on_update`: it runs before the document is
# written, so a critical card is visible while the clinician is still in
# the form. The handler never raises, so it cannot block the save.
doc_events = {
    "Patient Encounter": {
        "validate": "vedamd_cds.api.on_encounter_validate",
    },
}
