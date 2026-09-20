"""Tests for the HTTP and failure-handling layer of the Frappe app.

`frappe` and `requests` are stubbed so these run anywhere. The previous
version passed `timeout=` to frappe's make_post_request, which does not
accept it: every call raised TypeError, was swallowed, and returned no
cards. These tests pin the call shape and the never-block behaviour.
"""

import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class RequestException(Exception):
    pass


class Timeout(RequestException):
    pass


def install_stubs():
    frappe = types.ModuleType("frappe")
    frappe.conf = {"vedamd_api_key": "vmd_test_key", "vedamd_base_url": "https://api.test"}
    frappe.errors = []
    frappe.messages = []
    frappe.log_error = lambda title=None, **_: frappe.errors.append(title)
    frappe.msgprint = lambda **kw: frappe.messages.append(kw)
    frappe.generate_hash = lambda length=10: "h" * length
    frappe.whitelist = lambda *a, **k: (lambda fn: fn)
    frappe._ = lambda s: s
    frappe.utils = SimpleNamespace(escape_html=lambda s: s.replace("<", "&lt;").replace(">", "&gt;"))
    frappe.get_doc = mock.Mock(side_effect=Exception("no patient"))
    sys.modules["frappe"] = frappe

    requests = types.ModuleType("requests")
    requests.RequestException = RequestException
    requests.Timeout = Timeout
    requests.post = mock.Mock()
    sys.modules["requests"] = requests
    return frappe, requests


frappe, requests = install_stubs()
sys.modules.pop("vedamd_cds.api", None)
from vedamd_cds import api  # noqa: E402


def response(status=200, body=None, json_error=False):
    r = mock.Mock()
    r.status_code = status
    if json_error:
        r.json.side_effect = ValueError("not json")
    else:
        r.json.return_value = body if body is not None else {}
    return r


class EvaluateTests(unittest.TestCase):
    def setUp(self):
        requests.post.reset_mock(side_effect=True, return_value=True)
        frappe.errors.clear()
        frappe.messages.clear()

    def test_posts_to_the_service_with_bearer_key_and_a_timeout(self):
        requests.post.return_value = response(body={"cards": [{"summary": "x"}]})

        cards = api.evaluate({"medications": ["warfarin"]})

        self.assertEqual(cards, [{"summary": "x"}])
        args, kwargs = requests.post.call_args
        self.assertEqual(args[0], "https://api.test/cds-services/vedamd-order-select")
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer vmd_test_key")
        self.assertEqual(kwargs["json"]["context"], {"medications": ["warfarin"]})
        # A missing timeout lets a slow VedaMD hang the clinician's save.
        self.assertGreater(kwargs["timeout"], 0)

    def test_timeout_returns_no_cards_and_logs_the_failure_class(self):
        requests.post.side_effect = Timeout("slow")
        self.assertEqual(api.evaluate({"medications": ["warfarin"]}), [])
        self.assertIn("Timeout", frappe.errors[0])

    def test_non_200_returns_no_cards(self):
        requests.post.return_value = response(status=401)
        self.assertEqual(api.evaluate({"medications": ["warfarin"]}), [])
        self.assertIn("401", frappe.errors[0])

    def test_non_json_body_returns_no_cards(self):
        requests.post.return_value = response(json_error=True)
        self.assertEqual(api.evaluate({"medications": ["warfarin"]}), [])

    def test_missing_api_key_makes_no_request(self):
        with mock.patch.object(frappe, "conf", {}):
            self.assertEqual(api.evaluate({"medications": ["warfarin"]}), [])
        requests.post.assert_not_called()


class EncounterHookTests(unittest.TestCase):
    def setUp(self):
        requests.post.reset_mock(side_effect=True, return_value=True)
        frappe.messages.clear()

    def encounter(self, drugs):
        return SimpleNamespace(
            patient=None,
            patient_age="58 Year(s)",
            patient_sex="Female",
            drug_prescription=[SimpleNamespace(drug_name=d, medication=None, drug_code=None) for d in drugs],
            codification_table=[],
            diagnosis=[],
        )

    def test_shows_cards_as_messages_critical_interrupts(self):
        requests.post.return_value = response(
            body={"cards": [
                {"summary": "MAJOR interaction", "indicator": "critical"},
                {"summary": "Stewardship note", "indicator": "info"},
            ]}
        )
        api.on_encounter_validate(self.encounter(["Warfarin", "Ibuprofen"]))

        self.assertEqual(len(frappe.messages), 2)
        critical = frappe.messages[0]
        self.assertEqual(critical["indicator"], "red")
        self.assertFalse(critical["alert"])
        self.assertTrue(frappe.messages[1]["alert"])

    def test_escapes_card_text(self):
        requests.post.return_value = response(body={"cards": [{"summary": "<script>x</script>"}]})
        api.on_encounter_validate(self.encounter(["Warfarin"]))
        self.assertNotIn("<script>", frappe.messages[0]["msg"])

    def test_no_medications_means_no_request(self):
        api.on_encounter_validate(self.encounter([]))
        requests.post.assert_not_called()

    def test_never_raises_even_when_everything_fails(self):
        requests.post.side_effect = RuntimeError("unexpected")
        # Must not raise — a raise inside validate would block the save.
        api.on_encounter_validate(self.encounter(["Warfarin"]))


if __name__ == "__main__":
    unittest.main()
