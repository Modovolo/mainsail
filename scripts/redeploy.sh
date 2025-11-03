#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$REPO_ROOT/dist"
TARGET_DIR="/var/www/mainsail"
TARGET_INDEX="$TARGET_DIR/index.html"

cd "$REPO_ROOT"

existing_index_ts=0
if sudo test -f "$TARGET_INDEX"; then
  existing_index_ts=$(sudo stat -c %Y "$TARGET_INDEX" 2>/dev/null || echo 0)
fi

if [ ! -d "$REPO_ROOT/node_modules" ]; then
  echo "Installing npm dependencies..."
  npm ci
fi

echo "Building Mainsail frontend..."
npm run build

if [ ! -d "$TARGET_DIR" ]; then
  echo "Creating target directory $TARGET_DIR..."
  sudo mkdir -p "$TARGET_DIR"
fi

echo "Syncing build artifacts to $TARGET_DIR..."
sudo rsync -av --delete "$DIST_DIR"/ "$TARGET_DIR"/

new_index_ts=0
if sudo test -f "$TARGET_INDEX"; then
  new_index_ts=$(sudo stat -c %Y "$TARGET_INDEX" 2>/dev/null || echo 0)
fi

if [ "$existing_index_ts" -ne 0 ] && [ "$new_index_ts" -le "$existing_index_ts" ]; then
  echo "WARNING: $TARGET_INDEX timestamp did not advance (old: $existing_index_ts, new: $new_index_ts)." >&2
  echo "         Verify browser cache and deployment target manually." >&2
else
  if [ "$new_index_ts" -eq 0 ]; then
    echo "WARNING: Unable to read timestamp for $TARGET_INDEX." >&2
  else
    echo "Verified $TARGET_INDEX updated (timestamp $new_index_ts)."
  fi
fi

if command -v systemctl >/dev/null 2>&1; then
  if systemctl is-active --quiet nginx; then
    echo "Reloading nginx..."
    sudo systemctl reload nginx
  fi
fi

echo "Deployment finished."
