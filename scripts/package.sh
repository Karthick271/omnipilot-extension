#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REL_DIR="$ROOT_DIR/release"
mkdir -p "$REL_DIR"
VERSION=$(jq -r .version "$ROOT_DIR/manifest.json")
ZIP="$REL_DIR/chatpilot-$VERSION.zip"

echo "Packaging ChatPilot v$VERSION → $ZIP"
tmpdir=$(mktemp -d)
rsync -a --exclude node_modules --exclude .git --exclude release "$ROOT_DIR/" "$tmpdir/"
(
  cd "$tmpdir"
  zip -r "$ZIP" .
)
mv "$tmpdir/$ZIP" "$ZIP"
rm -rf "$tmpdir"
echo "Done."