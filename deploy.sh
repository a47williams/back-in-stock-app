#!/usr/bin/env bash
set -euo pipefail

# ---- SETTINGS ----
BRANCH="${1:-main}"          # pass a branch name as first arg if not main
COMMIT_MSG="${2:-chore: deploy}"  # pass a custom commit message as second arg

# ---- SAFETY ----
if [[ -f ".env" ]]; then
  echo "✅ .env present locally (will NOT be committed if .gitignore below is in place)."
else
  echo "ℹ️ No .env found locally (that’s fine in CI/Render)."
fi

# ---- GIT INIT (if needed) ----
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Initializing git repository…"
  git init
  git branch -M "$BRANCH"
  git remote add origin "https://github.com/<YOUR_GH_USERNAME>/<YOUR_REPO_NAME>.git"
fi

# ---- STATUS ----
echo "Current remote(s):"
git remote -v || true

# ---- ADD + COMMIT ----
echo "Adding files…"
git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
else
  echo "Committing…"
  git commit -m "$COMMIT_MSG"
fi

# ---- PUSH ----
echo "Pushing to origin/$BRANCH…"
git push -u origin "$BRANCH"

echo ""
echo "🎉 Push complete."
echo "If your Render service is connected to this repo and set to auto-deploy on push, it will redeploy now."
echo "If you use the Render deploy hook + GitHub Actions below, commits on $BRANCH will trigger a deploy."
