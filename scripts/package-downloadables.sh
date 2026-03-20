#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/deliverables"
TAR_PATH="$OUTPUT_DIR/photo-gear-manager-mac-source.tar.gz"
ZIP_PATH="$OUTPUT_DIR/photo-gear-manager-mac-source.zip"

mkdir -p "$OUTPUT_DIR"
rm -f "$TAR_PATH" "$ZIP_PATH"

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
  --exclude 'deliverables' \
  "$ROOT_DIR/" "$STAGE_DIR/"

tar -czf "$TAR_PATH" -C "$TMP_DIR" photo-gear-manager
(
  cd "$TMP_DIR"
  zip -qr "$ZIP_PATH" photo-gear-manager
)

echo "$TAR_PATH"
echo "$ZIP_PATH"
