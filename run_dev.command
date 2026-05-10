#!/bin/bash
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:$PATH"
cd "$(dirname "$0")"
echo "=== OakChat Dev Server ==="
echo ""
echo "Installing dependencies (first time only, takes ~30 sec)..."
npm install
echo ""
echo "Starting dev server..."
echo "Once you see 'Ready', open http://localhost:3000 in your browser."
echo ""
npm run dev
