#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT="${OUT:-o/emscripten}"
if [ ! -f "$OUT/blink.mjs" ] || [ -n "$(find blink/webapi.c blink/webapi.h build/config.emscripten.h -newer "$OUT/blink.mjs" 2>/dev/null)" ]; then
  OUT="$OUT" build/wasm.sh
fi

exec node --test "$@" test/webapi/*.test.mjs
