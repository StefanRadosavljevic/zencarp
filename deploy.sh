#!/bin/bash
set -e

echo "🚀 Deploying dev → master"

CURRENT_BRANCH=$(git branch --show-current)

if [ "$CURRENT_BRANCH" != "dev" ]; then
    echo "❌ Must be on dev branch."
    exit 1
fi

echo "📦 Adding changes..."
git add -A

if ! git diff --cached --quiet; then
    git commit -m "deploy: $(date '+%Y-%m-%d %H:%M:%S')"
else
    echo "ℹ️ No new changes to commit."
fi

echo "⬆️ Pushing dev..."
git push origin dev

echo "🔄 Updating master to exactly match dev..."
git push origin dev:master --force-with-lease

echo "✅ Deploy complete."
echo "   dev    → $(git rev-parse --short HEAD)"
echo "   master → same commit"
