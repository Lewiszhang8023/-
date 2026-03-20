#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/release"
DATE_TAG="$(date -u +%Y%m%d-%H%M%S)"
BASE_NAME="photo-gear-manager-mac-source-${DATE_TAG}"
TAR_PATH="$OUTPUT_DIR/${BASE_NAME}.tar.gz"
ZIP_PATH="$OUTPUT_DIR/${BASE_NAME}.zip"

mkdir -p "$OUTPUT_DIR"
rm -f "$OUTPUT_DIR"/photo-gear-manager-mac-source-*.tar.gz "$OUTPUT_DIR"/photo-gear-manager-mac-source-*.zip

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

STAGE_DIR="$TMP_DIR/photo-gear-manager"
mkdir -p "$STAGE_DIR"

rsync -a \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude 'dist-electron' \
  --exclude 'release' \
  "$ROOT_DIR/" "$STAGE_DIR/"

# tar.gz
 tar -czf "$TAR_PATH" -C "$TMP_DIR" photo-gear-manager

# zip
(
  cd "$TMP_DIR"
  zip -qr "$ZIP_PATH" photo-gear-manager
)

echo "$TAR_PATH"
echo "$ZIP_PATH"
