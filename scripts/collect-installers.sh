#!/usr/bin/env bash
# Copies the desktop installers that `pnpm tauri build` made into one folder, with release names.
# Used by the release workflow on every system (on Windows through Git Bash).
#
#   bash scripts/collect-installers.sh 5.0.0-rc.1 installers
#
# Tauri names the files after the product name ("ArboDat+_5.0.0-rc.1_universal.dmg"); GitHub would
# rename the "+" in a release asset, so they become "ArboDat-Plus_…". Fails if no installer was
# found, or if one carries a different version (e.g. a stale bundle from an earlier build).

set -euo pipefail

version="${1:?usage: collect-installers.sh <version> <output folder>}"
out="${2:?usage: collect-installers.sh <version> <output folder>}"
mkdir -p "$out"

found=0
while IFS= read -r -d '' file; do
  name="$(basename "$file")"
  case "$name" in
    *"_${version}_"*) ;;
    *)
      echo "::error::$name doesn't carry version $version"
      exit 1
      ;;
  esac
  target="${name/ArboDat+/ArboDat-Plus}"
  cp "$file" "$out/$target"
  echo "$file -> $out/$target"
  found=$((found + 1))
done < <(find desktop/src-tauri/target -path '*/release/bundle/*' -type f \
  \( -name '*.dmg' -o -name '*-setup.exe' -o -name '*.deb' -o -name '*.AppImage' \) -print0)

if [ "$found" -eq 0 ]; then
  echo "::error::no installers found under desktop/src-tauri/target/*/release/bundle/"
  exit 1
fi
