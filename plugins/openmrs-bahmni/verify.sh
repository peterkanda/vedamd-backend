#!/usr/bin/env bash
# Verifies a VedaMD bridge the way openmrs-module-cdss does: discovery
# first, then a real order-select call with the exact payload shape the
# module builds. Run it from the OpenMRS host so it exercises the same
# network path.
set -euo pipefail

BASE="${1:-http://localhost:8088}"
SERVICE="${2:-vedamd-order-select}"
TOKEN_HEADER=()
[ -n "${BRIDGE_TOKEN:-}" ] && TOKEN_HEADER=(-H "X-Bridge-Token: ${BRIDGE_TOKEN}")

echo "1/3  Discovery — GET ${BASE}/cds-services"
services=$(curl -fsS "${TOKEN_HEADER[@]}" "${BASE}/cds-services")
count=$(printf '%s' "$services" | grep -o '"id"' | wc -l | tr -d ' ')
echo "     ${count} service(s) advertised"
if [ "$count" -eq 0 ]; then
  echo "     FAIL: empty service list — the bridge cannot reach VedaMD," >&2
  echo "           or the API key is rejected. Check the bridge's /healthz." >&2
  exit 1
fi

echo "2/3  Service '${SERVICE}' present?"
printf '%s' "$services" | grep -q "\"${SERVICE}\"" \
  || { echo "     FAIL: '${SERVICE}' not advertised upstream." >&2; exit 1; }
echo "     yes"

echo "3/3  Invocation with an openmrs-module-cdss shaped payload"
# Warfarin (active) + ibuprofen (draft) — a pairing VedaMD flags.
response=$(curl -fsS "${TOKEN_HEADER[@]}" -X POST "${BASE}/cds-services/${SERVICE}" \
  -H 'Content-Type: application/json' \
  -d '{
    "hook": "'"${SERVICE}"'",
    "prefetch": {
      "patient": {"resourceType":"Patient","gender":"female","birthDate":"1958-06-01"},
      "conditions": {"resourceType":"Bundle","entry":[]},
      "draftMedicationRequests": {"resourceType":"Bundle","entry":[
        {"resource":{"resourceType":"MedicationRequest","status":"active",
          "medicationCodeableConcept":{"text":"Warfarin 5mg Tablet",
            "coding":[{"system":"https://fhir.openmrs.org","code":"uuid-1","display":"Warfarin 5mg Tablet"}]}}},
        {"resource":{"resourceType":"MedicationRequest","status":"draft",
          "medicationCodeableConcept":{"text":"Ibuprofen 400mg Tablet",
            "coding":[{"system":"https://fhir.openmrs.org","code":"uuid-2","display":"Ibuprofen 400mg Tablet"}]}}}
      ]}
    }
  }')

cards=$(printf '%s' "$response" | grep -o '"summary"' | wc -l | tr -d ' ')
echo "     ${cards} card(s) returned"
if [ "$cards" -eq 0 ]; then
  echo "     FAIL: no cards for a warfarin + ibuprofen pair." >&2
  echo "           VedaMD could not resolve the drug names it was sent." >&2
  exit 1
fi

printf '%s\n' "$response" | head -c 600
echo
echo "OK — OpenMRS/Bahmni can reach VedaMD and receives cards."
