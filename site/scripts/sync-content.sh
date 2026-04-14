#!/bin/bash
# Sync markdown content from repo root into site/content/ for Next.js build
set -e

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONTENT_DIR="$(cd "$(dirname "$0")/.." && pwd)/content"

rm -rf "$CONTENT_DIR"
mkdir -p "$CONTENT_DIR"

for dir in articles guide landscape papers zh-guide; do
  if [ -d "$REPO_ROOT/$dir" ]; then
    cp -r "$REPO_ROOT/$dir" "$CONTENT_DIR/$dir"
    echo "✓ Synced $dir/ ($(ls "$CONTENT_DIR/$dir" | wc -l | tr -d ' ') files)"
  fi
done

echo "Content sync complete."
