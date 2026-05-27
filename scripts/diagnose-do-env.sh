#!/usr/bin/env bash
#
# Diagnostic: list every environment variable defined on every component
# of a DigitalOcean App Platform app. Use this to confirm whether
# OPENAI_API_KEY (or any other secret) is actually on the backend
# component vs being silently lost in the dashboard UI.
#
# Usage:
#   DO_API_TOKEN=dop_v1_xxx ./scripts/diagnose-do-env.sh [APP_ID]
#
# If APP_ID is omitted, the script prints a list of all your apps so
# you can pick the right one.

set -euo pipefail

: "${DO_API_TOKEN:?DO_API_TOKEN env var is required (https://cloud.digitalocean.com/account/api/tokens)}"

if ! command -v jq >/dev/null 2>&1; then
  echo "This script requires 'jq' (brew install jq)." >&2
  exit 1
fi

if [[ $# -eq 0 ]]; then
  echo "No APP_ID given. Listing your apps so you can pick one:"
  echo
  curl -fsS \
    -H "Authorization: Bearer $DO_API_TOKEN" \
    https://api.digitalocean.com/v2/apps \
    | jq -r '.apps[] | "\(.id)\t\(.spec.name)\t\(.live_url // "<no live url>")"' \
    | column -t -s $'\t'
  echo
  echo "Re-run with: ./scripts/diagnose-do-env.sh <APP_ID>"
  exit 0
fi

APP_ID="$1"

echo "→ Fetching spec for app $APP_ID..."
SPEC=$(curl -fsS \
  -H "Authorization: Bearer $DO_API_TOKEN" \
  "https://api.digitalocean.com/v2/apps/$APP_ID" \
  | jq '.app.spec')

# App-level env vars (these apply to every component).
echo
echo "=== APP-LEVEL env vars ==="
echo "$SPEC" | jq -r '
  (.envs // []) as $e
  | if ($e | length) == 0 then "  (none set at app level)"
    else ($e | .[] | "  \(.key) (type=\(.type // "unset"), scope=\(.scope // "unset"))")
    end'

# Per-service env vars (this is where most issues hide).
echo
echo "=== SERVICE components ==="
echo "$SPEC" | jq -r '
  (.services // []) as $s
  | if ($s | length) == 0 then "  (no services in spec)"
    else
      $s | .[] |
      "\n[service: \(.name)]" +
      "\n  run_command: \(.run_command // "<default>")" +
      "\n  source: \(.source_dir // "/") @ \(.github.repo // .git.repo_clone_url // "?")" +
      "\n  envs:" +
      (
        (.envs // []) as $e
        | if ($e | length) == 0 then "\n    (no envs on this component)"
          else ($e | map("\n    " + .key + " (type=" + (.type // "unset") + ", scope=" + (.scope // "unset") + ")") | join(""))
          end
      )
    end'

# Static sites for completeness.
echo
echo "=== STATIC SITE components ==="
echo "$SPEC" | jq -r '
  (.static_sites // []) as $s
  | if ($s | length) == 0 then "  (no static sites)"
    else
      $s | .[] |
      "\n[static_site: \(.name)]" +
      "\n  envs:" +
      (
        (.envs // []) as $e
        | if ($e | length) == 0 then "\n    (no envs)"
          else ($e | map("\n    " + .key + " (type=" + (.type // "unset") + ", scope=" + (.scope // "unset") + ")") | join(""))
          end
      )
    end'

echo
echo "→ Done. If OPENAI_API_KEY does not appear under the backend SERVICE component,"
echo "  that's why the agentic engine reports agenticEnabled:false. Set it there."
