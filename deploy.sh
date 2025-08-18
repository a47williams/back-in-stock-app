#!/usr/bin/env bash
# One-shot deploy: stages all changes, commits, and pushes to main.
# Usage: chmod +x deploy.sh && ./deploy.sh "deploy: message"

set -e

COMMIT_MSG="${1:-deploy: latest changes}"

# Ensure git repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git init
  git checkout -B main
fi

# Ensure identity (quiet defaults if unset)
git config user.name  >/dev/null 2>&1 || git config user.name "$(whoami)"
git config user.email >/dev/null 2>&1 || git config user.email "$(whoami)@$(hostname -s).local"

# Make sure origin exists (edit URL if needed)
if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "https://github.com/<YOUR_GH_USERNAME>/<YOUR_REPO_NAME>.git"
fi

# Add useful .gitignore if missing
if [ ! -f .gitignore ]; then
cat > .gitignore <<'EOF'
node_modules/
package-lock.json
.env
.env.*.local
*.log
.DS_Store
dist/
.next/
coverage/
EOF
fi

git add -A
if git diff --cached --quiet; then
  echo "No changes to commit."
else
  git commit -m "$COMMIT_MSG"
fi

# Push to main
git push -u origin main

echo "✅ Pushed to main. If Render is connected to this repo/branch, it will redeploy automatically."
