#!/usr/bin/env bash
# Robust, copy/paste-safe deploy helper for macOS (zsh/bash)
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh                 # pushes to main with default message
#   ./deploy.sh dev "feat: x"   # pushes to branch "dev" with custom message

set -e  # fail fast (avoid -u to prevent "unbound variable" issues from copy/paste artifacts)

# --- Inputs ---
BRANCH="${1:-main}"
COMMIT_MSG="${2:-chore: deploy}"

# --- Ensure we're in a git repo ---
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Initializing git repository…"
  git init
fi

# --- Ensure user.name/email are set (quietly set safe defaults if missing) ---
if ! git config user.name >/dev/null 2>&1; then
  git config user.name "$(whoami)"
fi
if ! git config user.email >/dev/null 2>&1; then
  git config user.email "$(whoami)@$(scutil --get LocalHostName 2>/dev/null || hostname -s).local"
fi

# --- Ensure branch exists and is current ---
CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")"
if [ -z "$CURRENT_BRANCH" ] || [ "$CURRENT_BRANCH" = "HEAD" ]; then
  git checkout -B "$BRANCH"
elif [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  git checkout -B "$BRANCH"
fi

# --- Ensure remote origin exists (edit the URL if needed) ---
if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Adding origin remote…"
  git remote add origin "https://github.com/<YOUR_GH_USERNAME>/<YOUR_REPO_NAME>.git"
fi

echo "Remote(s):"
git remote -v

# --- Respect .gitignore (make sure it's there) ---
if [ ! -f .gitignore ]; then
  cat > .gitignore <<'EOF'
node_modules/
package-lock.json
.env
.env.*.local
*.log
.DS_Store
dist/
.tmp/
.next/
coverage/
EOF
fi

# --- Add & commit if there are changes ---
git add -A

if git diff --cached --quiet; then
  echo "No changes to commit."
else
  echo "Committing: $COMMIT_MSG"
  git commit -m "$COMMIT_MSG" || true
fi

# --- Push ---
echo "Pushing to origin/$BRANCH …"
git push -u origin "$BRANCH"

echo "🎉 Push complete. If Render auto-deploys on push, it will redeploy now."
