#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")"
echo "=== Pushing to GitHub ==="
rm -f .git/HEAD.lock .git/index.lock
git add -A
git commit -m "feat: settings panel + per-platform store naming"
git push origin main
echo ""
echo "=== Done! Vercel will deploy in ~1 minute ==="
read -n 1
