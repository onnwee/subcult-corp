#!/usr/bin/env bash
# Clean up generated/cached artifacts under openclaw/
#   - node_modules directories
#   - .clawhub directories
#   - _meta.json files
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

dirs=$(find "$SCRIPT_DIR" \( -type d -name node_modules -o -type d -name .clawhub \) 2>/dev/null)
files=$(find "$SCRIPT_DIR" -type f -name _meta.json 2>/dev/null)

if [[ -z "$dirs" && -z "$files" ]]; then
  echo "Nothing to clean under openclaw/"
  exit 0
fi

if [[ -n "$dirs" ]]; then
  echo "Directories to remove:"
  echo "$dirs" | while read -r d; do du -sh "$d" 2>/dev/null; done
  echo ""
fi

if [[ -n "$files" ]]; then
  echo "Files to remove:"
  echo "$files"
  echo ""
fi

read -rp "Delete all? [y/N] " confirm
if [[ "$confirm" =~ ^[Yy]$ ]]; then
  if [[ -n "$dirs" ]]; then
    echo "$dirs" | while read -r d; do
      echo "Removing $d"
      rm -rf "$d"
    done
  fi
  if [[ -n "$files" ]]; then
    echo "$files" | while read -r f; do
      echo "Removing $f"
      rm -f "$f"
    done
  fi
  echo "Done."
else
  echo "Aborted."
fi
