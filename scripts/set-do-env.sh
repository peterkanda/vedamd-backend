#!/usr/bin/env bash
#
# Push environment variables from the local .env to a DigitalOcean
# App Platform component, then trigger a redeploy. Avoids the dashboard
# entirely. No doctl required — uses curl + the DO REST API.
#
# Usage:
#   DO_API_TOKEN=dop_v1_xxx \
#   DO_APP_ID=<app-uuid> \
#   DO_COMPONENT_NAME=<backend-component-name> \
#   ./scripts/set-do-env.sh OPENAI_API_KEY ANTHROPIC_API_KEY AUDIT_HASH_SECRET ...
#
# - DO_API_TOKEN: create one at https://cloud.digitalocean.com/account/api/tokens
# - DO_APP_ID: visible in the app URL or via `GET /v2/apps`
# - DO_COMPONENT_NAME: from the app spec — usually the service name
#   (look in the DO dashboard or `curl .../apps/{id}` to confirm)
#
# Each env-var name passed as an argument is read from the local .env
# file, marked SECRET + RUN_TIME, merged into the component's envs,
# and pushed back via PUT /v2/apps/{id}. DO redeploys automatically
# on spec change.

set -euo pipefail

: "${DO_API_TOKEN:?DO_API_TOKEN env var is required}"
: "${DO_APP_ID:?DO_APP_ID env var is required}"
: "${DO_COMPONENT_NAME:?DO_COMPONENT_NAME env var is required}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Cannot find .env at $ENV_FILE" >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  echo "Pass one or more env-var names as arguments." >&2
  echo "Example: $0 OPENAI_API_KEY ANTHROPIC_API_KEY" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "This script requires 'jq' (brew install jq)." >&2
  exit 1
fi

# Fetch the current spec.
echo "→ Fetching app spec for $DO_APP_ID..."
SPEC=$(curl -fsS \
  -H "Authorization: Bearer $DO_API_TOKEN" \
  "https://api.digitalocean.com/v2/apps/$DO_APP_ID" \
  | jq '.app.spec')

# Build the list of {key, value, type, scope} entries from .env.
echo "→ Reading requested keys from .env..."
NEW_ENVS="[]"
for KEY in "$@"; do
  VALUE=$(grep -E "^${KEY}=" "$ENV_FILE" | head -1 | cut -d= -f2-)
  if [[ -z "$VALUE" ]]; then
    echo "  ! $KEY not found in .env — skipping" >&2
    continue
  fi
  NEW_ENVS=$(jq -n --argjson cur "$NEW_ENVS" --arg k "$KEY" --arg v "$VALUE" \
    '$cur + [{key: $k, value: $v, type: "SECRET", scope: "RUN_TIME"}]')
  echo "  ✓ $KEY"
done

# Merge into the named service component.
echo "→ Merging into component '$DO_COMPONENT_NAME'..."
NEW_SPEC=$(echo "$SPEC" | jq --arg name "$DO_COMPONENT_NAME" --argjson new "$NEW_ENVS" '
  .services |= map(
    if .name == $name then
      .envs = (
        (.envs // []) as $existing
        | ($new | map(.key)) as $newKeys
        | ($existing | map(select(.key as $k | $newKeys | index($k) | not))) + $new
      )
    else . end
  )
')

# PUT it back.
echo "→ Pushing spec..."
curl -fsS \
  -H "Authorization: Bearer $DO_API_TOKEN" \
  -H "Content-Type: application/json" \
  -X PUT \
  -d "$(jq -n --argjson s "$NEW_SPEC" '{spec: $s}')" \
  "https://api.digitalocean.com/v2/apps/$DO_APP_ID" \
  > /dev/null

echo "✓ Spec updated. DigitalOcean will redeploy automatically."
echo "  Watch deploy status at: https://cloud.digitalocean.com/apps/$DO_APP_ID/deployments"
