#!/usr/bin/env bash
# Load a compiled .bsp in a real OpenJK dedicated server and report one line.
# Usage: tools/loadtest.sh [map.bsp]   (default: compiles the sample map first)
# Full server output goes to $CACHE/loadtest.log; only PASS/FAIL (plus a short tail on FAIL) is printed.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
CACHE="${MB2_CACHE:-$ROOT/.cache}"; LOG="$CACHE/loadtest.log"
OJK=$("$ROOT/tools/openjk-server.sh" | tail -1)
BSP="${1:-$CACHE/sample.bsp}"
[ $# -gt 0 ] || node "$ROOT/tests/bsp.test.js" "$BSP" >/dev/null
NAME=$(basename "$BSP" .bsp)
HOME_DIR="$CACHE/ojk-home"; rm -rf "$HOME_DIR"; mkdir -p "$HOME_DIR/base/maps"
cp "$BSP" "$HOME_DIR/base/maps/$NAME.bsp"
# The server refuses to start without a non-empty mpdefault.cfg (no game assets are needed otherwise).
[ -s "$OJK/base/mpdefault.cfg" ] || echo 'set sv_hostname "mb2-mapmaker loadtest"' > "$OJK/base/mpdefault.cfg"
cd "$OJK"
timeout 60 ./openjkded* +set dedicated 1 +set fs_basepath "$OJK" +set fs_homepath "$HOME_DIR" +set fs_cdpath "" \
  +set g_gametype 0 +set sv_pure 0 +set developer 1 +map "$NAME" +wait 10 +quit >"$LOG" 2>&1 && RC=0 || RC=$?
# A good load reaches the game module (InitGame) and exits cleanly; a bad .bsp crashes or errors in CM_LoadMap.
if [ "$RC" != 0 ] || ! grep -q 'InitGame' "$LOG" || grep -qiE 'Couldn.t load|ERROR:|wrong version|funny lump|exceeded|Bad |overflow' "$LOG" || ! grep -q 'Server: '"$NAME"'' "$LOG"; then
  echo "loadtest: FAIL $NAME (exit $RC, log: $LOG)"; grep -iE 'error|couldn|warn|bad|exceed' "$LOG" | tail -8; exit 1
fi
echo "loadtest: PASS $NAME ($(grep -c . "$LOG") log lines)"
