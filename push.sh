#!/usr/bin/env bash
# Even shorter alias to push with a default message
set -e
git add -A
git commit -m "${1:-deploy: update}"
git push origin main
echo "✅ Pushed."
