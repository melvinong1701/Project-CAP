#!/bin/bash
cd "$(dirname "$0")"
echo "=== OakChat GitHub Push ==="
echo ""

# Set git identity
git config --global user.email "melvinong1701@gmail.com"
git config --global user.name "Melvin Ong"

# Check if git is already initialized
if [ ! -d ".git" ]; then
  echo "Initializing git..."
  git init
  git remote add origin https://github.com/melvinong1701/Project-CAP.git
else
  echo "Git already initialized."
  git remote set-url origin https://github.com/melvinong1701/Project-CAP.git
fi

echo ""
echo "Staging all files..."
git add .

echo "Committing..."
git commit -m "feat: initial OakChat UI scaffold - three-pane inbox with AI reply drafts"

echo ""
echo "Pushing to GitHub..."
git push -u origin main --force

echo ""
echo "=== Done! Check https://github.com/melvinong1701/Project-CAP ==="
echo "Press any key to close this window."
read -n 1
