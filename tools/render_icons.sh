#!/usr/bin/env bash
#
# Rasterize assets/icon.svg into icons/icon{16,48,128}.png using only macOS
# built-ins (qlmanage renders the SVG via Quick Look; sips resizes).
#
set -euo pipefail
cd "$(dirname "$0")/.."

SVG="assets/icon.svg"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

qlmanage -t -s 512 -o "$TMP" "$SVG" >/dev/null 2>&1 || true
SRC="$TMP/$(basename "$SVG").png"
if [ ! -f "$SRC" ]; then
  echo "error: qlmanage could not render $SVG (no SVG Quick Look support?)" >&2
  exit 1
fi

mkdir -p icons
for s in 16 48 128; do
  sips -z "$s" "$s" "$SRC" --out "icons/icon${s}.png" >/dev/null
done
echo "Rendered icons/icon16.png, icon48.png, icon128.png from $SVG"
