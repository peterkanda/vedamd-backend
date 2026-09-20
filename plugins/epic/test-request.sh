#!/usr/bin/env bash
# Sends sample-order-select.json — the payload shape Epic and Oracle Health
# send — to VedaMD. A warfarin + ibuprofen pair should return an
# interaction card. Run it before starting vendor onboarding to prove the
# technical integration works end to end.
set -euo pipefail
: "${VEDAMD_API_KEY:?Set VEDAMD_API_KEY to a vmd_test_ or vmd_live_ key}"
BASE="${VEDAMD_BASE_URL:-https://api.vedamd.io}"
cd "$(dirname "$0")"

curl -fsS -X POST "${BASE}/cds-services/vedamd-order-select" \
  -H "Authorization: Bearer ${VEDAMD_API_KEY}" \
  -H "Content-Type: application/json" \
  --data @sample-order-select.json
echo
