#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/apps/sketchup-extension"
LOADER="$SRC_DIR/constructflow.rb"

if [[ ! -f "$LOADER" || ! -d "$SRC_DIR/constructflow" ]]; then
  echo "ConstructFlow SketchUp extension source not found under $SRC_DIR" >&2
  exit 1
fi

VERSION="$(ruby -e "text = File.read(ARGV[0]); match = text.match(/VERSION\\s*=\\s*['\\\"]([^'\\\"]+)['\\\"]/); abort('VERSION not found') unless match; puts match[1]" "$LOADER")"
OUT_PATH="${1:-$ROOT_DIR/dist/ConstructFlow-${VERSION}.rbz}"
mkdir -p "$(dirname "$OUT_PATH")"
OUT_PATH="$(cd "$(dirname "$OUT_PATH")" && pwd)/$(basename "$OUT_PATH")"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

cp "$LOADER" "$TMP_DIR/constructflow.rb"
cp -R "$SRC_DIR/constructflow" "$TMP_DIR/constructflow"
find "$TMP_DIR" -name '.DS_Store' -delete

rm -f "$OUT_PATH"
(
  cd "$TMP_DIR"
  zip -X -q -r "$OUT_PATH" constructflow.rb constructflow
)

unzip -tq "$OUT_PATH" >/dev/null

mapfile -t ROOT_ENTRIES < <(unzip -Z1 "$OUT_PATH" | awk -F/ 'NF == 1 || (NF == 2 && $2 == "") { print }' | sort -u)
EXPECTED=("constructflow.rb" "constructflow/")
if [[ "${ROOT_ENTRIES[*]}" != "${EXPECTED[*]}" ]]; then
  echo "Unexpected RBZ root layout: ${ROOT_ENTRIES[*]}" >&2
  exit 1
fi

if ! unzip -Z1 "$OUT_PATH" | grep -x 'constructflow/bootstrap.rb' >/dev/null; then
  echo "RBZ is missing constructflow/bootstrap.rb" >&2
  exit 1
fi

printf 'Built %s\n' "$OUT_PATH"
printf 'Version: %s\n' "$VERSION"
printf 'Files: %s\n' "$(unzip -Z1 "$OUT_PATH" | grep -vc '/$')"
