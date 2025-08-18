#!/usr/bin/env bash
# Trigger a Render deploy using a Deploy Hook URL.
# Usage:
#   chmod +x redeploy.sh
#   ./redeploy.sh "https://api.render.com/deploy/srv-XXXXXX?key=YYYYYY"
# or set env var RENDER_DEPLOY_HOOK and run:
#   ./redeploy.sh

set -euo pipefail

HOOK_URL="${1:-${RENDER_DEPLOY_HOOK:-}}"

if [[ -z "${HOOK_URL}" ]]; then
  echo "❌ Missing Render Deploy Hook URL."
  echo "Pass it as an argument or set RENDER_DEPLOY_HOOK env var."
  exit 1
fi

echo "🚀 Triggering Render deploy…"
curl -fsSL -X POST "${HOOK_URL}"
echo
echo "✅ Deploy hook called."
