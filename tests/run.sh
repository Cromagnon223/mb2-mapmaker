#!/usr/bin/env bash
# One command for every check. Prints one line per check; full output goes to $CACHE/test.log.
# Usage: tests/run.sh            unit tests (node, seconds)
#        tests/run.sh --engine   also load the compiled sample map in a real OpenJK server (first run builds it, ~30 s; then cached)
set -uo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
export MB2_CACHE="${MB2_CACHE:-$ROOT/.cache}"; mkdir -p "$MB2_CACHE"
LOG="$MB2_CACHE/test.log"; : >"$LOG"; FAIL=0
check() { local name=$1; shift
  if "$@" >>"$LOG" 2>&1; then echo "ok   $name"; else echo "FAIL $name (see $LOG)"; FAIL=1; fi; }
check mapgen node "$ROOT/tests/mapgen.test.js"
check bsp    node "$ROOT/tests/bsp.test.js" "$MB2_CACHE/sample.bsp"
[ "${1:-}" = --engine ] && check engine-load "$ROOT/tools/loadtest.sh" "$MB2_CACHE/sample.bsp"
[ $FAIL = 0 ] || tail -15 "$LOG"
exit $FAIL
