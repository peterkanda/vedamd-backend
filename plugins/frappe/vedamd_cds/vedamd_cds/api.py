"""VedaMD CDS integration points for Frappe Health.

Design notes
------------
This is a Frappe **app**, so it is not subject to the RestrictedPython
sandbox that Server Scripts run under and can use `requests` directly.

It deliberately does NOT use `frappe.integrations.utils.make_post_request`:
in Frappe v15 that helper's signature is
`make_request(method, url, auth, headers, data, json, params)` — it takes
no `timeout`. Passing one raises TypeError, and a helper with no timeout
at all would let a slow VedaMD hang the clinician's save.

Failure policy: a decision-support outage must never stop a clinician
from saving an encounter. Every error path logs and returns no cards.
"""

import frappe
import requests
from frappe import _

from vedamd_cds.context import build_context

DEFAULT_SERVICE = "vedamd-order-select"
DEFAULT_TIMEOUT = 4


def on_encounter_validate(doc, method=None):
    """Surfaces VedaMD cards while a Patient Encounter is being saved.

    Runs on `validate` so the clinician sees warnings before the
    document is committed. Cards are shown as Frappe messages rather
    than thrown as exceptions: VedaMD advises, it does not veto. A CDS
    service that blocks saves gets switched off within a week.
    """
    settings = get_settings()
    if not settings.get("enabled"):
        return

    try:
        patient = frappe.get_doc("Patient", doc.patient) if doc.patient else None
    except Exception:
        patient = None

    try:
        context = build_context(doc, patient)
        # Every rule behind the order-select service is a prescribing
        # check; with no medications there is nothing to evaluate.
        if not context.get("medications"):
            return
        cards = evaluate(context, settings)
    except Exception:
        # log_error keeps the traceback in the site's error log without
        # putting patient data in front of the user.
        frappe.log_error(title="VedaMD CDS evaluation failed")
        return

    for card in cards:
        _show_card(card)


def evaluate(context, settings=None):
    """Calls a VedaMD CDS Hooks service. Returns a list of cards."""
    settings = settings or get_settings()

    api_key = settings.get("api_key")
    if not api_key:
        frappe.log_error(title="VedaMD CDS not configured (missing API key)")
        return []

    base_url = (settings.get("base_url") or "https://api.vedamd.io").rstrip("/")
    service = settings.get("service_id") or DEFAULT_SERVICE
    url = f"{base_url}/cds-services/{service}"

    payload = {
        "hook": "order-select",
        "hookInstance": frappe.generate_hash(length=20),
        "context": context,
    }

    try:
        response = requests.post(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            json=payload,
            timeout=float(settings.get("timeout") or DEFAULT_TIMEOUT),
        )
    except requests.RequestException as exc:
        # Log the failure class only — the payload is patient data.
        frappe.log_error(title=f"VedaMD CDS request failed: {type(exc).__name__}")
        return []

    if response.status_code != 200:
        frappe.log_error(title=f"VedaMD CDS returned HTTP {response.status_code}")
        return []

    try:
        body = response.json()
    except ValueError:
        frappe.log_error(title="VedaMD CDS returned a non-JSON response")
        return []

    if not isinstance(body, dict):
        return []

    cards = body.get("cards")
    return cards if isinstance(cards, list) else []


def _show_card(card):
    """Renders one card as a Frappe message.

    Indicator drives the visual weight: `critical` gets a red alert the
    clinician must dismiss, everything else a passive message. Nothing
    here raises — see the module docstring.
    """
    if not isinstance(card, dict):
        return

    summary = card.get("summary")
    if not summary:
        return

    indicator = card.get("indicator", "info")
    colour = {"critical": "red", "warning": "orange"}.get(indicator, "blue")

    detail = card.get("detail") or ""
    source = (card.get("source") or {}).get("label") or ""

    message = f"<b>{frappe.utils.escape_html(str(summary))}</b>"
    if detail:
        message += f"<br>{frappe.utils.escape_html(str(detail))}"
    if source:
        message += f"<br><small>{frappe.utils.escape_html(str(source))}</small>"

    frappe.msgprint(
        msg=message,
        title=_("VedaMD Clinical Decision Support"),
        indicator=colour,
        # Critical findings interrupt; the rest accumulate quietly.
        alert=(indicator != "critical"),
    )


def get_settings():
    """Reads module settings from site_config.json.

    site_config.json is the right home for an API key: it is not in the
    database, so it never lands in a database backup shared with a third
    party. Set values with `bench --site <site> set-config <key> <value>`.
    """
    conf = frappe.conf or {}
    return {
        "enabled": conf.get("vedamd_enabled", True),
        "api_key": conf.get("vedamd_api_key"),
        "base_url": conf.get("vedamd_base_url"),
        "service_id": conf.get("vedamd_service_id"),
        "timeout": conf.get("vedamd_timeout"),
    }


@frappe.whitelist()
def check_encounter(encounter_name):
    """Re-runs the check on demand from the Patient Encounter form."""
    doc = frappe.get_doc("Patient Encounter", encounter_name)
    doc.check_permission("read")

    patient = frappe.get_doc("Patient", doc.patient) if doc.patient else None
    return evaluate(build_context(doc, patient))
