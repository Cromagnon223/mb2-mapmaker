#!/usr/bin/env bash
# Build the OpenJK dedicated server once and reuse it (cached by OpenJK commit).
# Usage: tools/openjk-server.sh   -> prints the install dir on its last line.
# Output of clone/cmake/make goes to $CACHE/openjk-build.log, never to the console.
set -euo pipefail
CACHE="${MB2_CACHE:-$(cd "$(dirname "$0")/.." && pwd)/.cache}"
REF="${OPENJK_REF:-master}"
SRC="$CACHE/openjk-src" OUT="$CACHE/openjk" LOG="$CACHE/openjk-build.log"
mkdir -p "$CACHE"
if [ ! -d "$SRC/.git" ]; then git clone -q --depth 1 --branch "$REF" https://github.com/JACoders/OpenJK "$SRC" >>"$LOG" 2>&1; fi
REV=$(git -C "$SRC" rev-parse --short HEAD)
if [ -f "$OUT/.rev" ] && [ "$(cat "$OUT/.rev")" = "$REV" ] && ls "$OUT"/openjkded* >/dev/null 2>&1; then
  echo "openjk: cached ($REV)"; echo "$OUT"; exit 0
fi
echo "openjk: building $REV (log: $LOG)"
OFF="-DBuildMPEngine=OFF -DBuildMPRdVanilla=OFF -DBuildMPCGame=OFF -DBuildMPUI=OFF -DBuildMPRend2=OFF -DBuildSPEngine=OFF -DBuildSPGame=OFF -DBuildSPRdVanilla=OFF"
cmake -S "$SRC" -B "$CACHE/openjk-build" -DCMAKE_BUILD_TYPE=Release -DCMAKE_INSTALL_PREFIX="$OUT" \
  -DBuildMPDed=ON -DBuildMPGame=ON $OFF -DUseInternalZlib=ON -DUseInternalPNG=ON -DUseInternalJPEG=ON >>"$LOG" 2>&1
cmake --build "$CACHE/openjk-build" -j "${JOBS:-4}" >>"$LOG" 2>&1 || { tail -20 "$LOG"; exit 1; }
cmake --install "$CACHE/openjk-build" >>"$LOG" 2>&1
# The installed layout differs by platform; normalise to $OUT/openjkded* and $OUT/base/jampgame*.
DED=$(find "$OUT" "$CACHE/openjk-build" -name 'openjkded*' -type f | head -1)
GAME=$(find "$OUT" "$CACHE/openjk-build" -name 'jampgame*' -type f | head -1)
mkdir -p "$OUT/base"; cp -f "$DED" "$OUT/"; cp -f "$GAME" "$OUT/base/"
echo "$REV" > "$OUT/.rev"
echo "$OUT"
