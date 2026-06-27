#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

EMCC="${EMCC:-emcc}"
OUT="${OUT:-o/emscripten}"
CFLAGS="${CFLAGS:--O2}"
CONFIG="build/config.emscripten.h"
NAME="${NAME:-blink}"
EXPORT_NAME="${EXPORT_NAME:-createBlink}"

if [ "${1:-}" = "clean" ]; then
  rm -rf "$OUT"
  echo "cleaned $OUT"
  exit 0
fi

command -v "$EMCC" >/dev/null || { echo "error: $EMCC not found (run 'source emsdk_env.sh')" >&2; exit 1; }


mkdir -p "$OUT"
cp "$CONFIG" "$OUT/config.h"

CPPFLAGS="-iquote $OUT -iquote . -isystem third_party/libz \
  -D_FILE_OFFSET_BITS=64 -D_DARWIN_C_SOURCE -D_DEFAULT_SOURCE -D_BSD_SOURCE -D_GNU_SOURCE"

mains="blink/blink.c blink/blinkenlights.c blink/oneoff.c"
srcs=""
for f in blink/*.c third_party/libz/*.c; do
  case " $mains " in *" $f "*) continue;; esac
  srcs="$srcs $f"
done

objs=""
for src in $srcs; do
  obj="$OUT/${src%.c}.o"
  objs="$objs $obj"
  if [ -f "$obj" ] && [ "$obj" -nt "$src" ] && [ "$obj" -nt "$CONFIG" ]; then
    continue
  fi
  mkdir -p "$(dirname "$obj")"
  case "$src" in third_party/*) extra="-xc -w";; *) extra="";; esac
  echo "CC  $src"
  $EMCC $CFLAGS $CPPFLAGS $extra -c "$src" -o "$obj"
done

exports=$(grep -oE 'blink_[a-z_]+' blink/webapi.h | sort -u | sed 's/^/_/' | paste -sd, -)
exports="$exports,_malloc,_free"

echo "LINK $OUT/$NAME.mjs"
$EMCC $CFLAGS $objs -o "$OUT/$NAME.mjs" \
  --no-entry \
  -sASYNCIFY \
  -sALLOW_MEMORY_GROWTH=1 \
  -sMODULARIZE=1 \
  -sEXPORT_ES6=1 \
  -sEXPORT_NAME="$EXPORT_NAME" \
  -sEXPORTED_FUNCTIONS="$exports" \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,FS,getValue,setValue,UTF8ToString,lengthBytesUTF8,stringToUTF8

echo "GEN $OUT/registers.json"
$EMCC $CFLAGS $CPPFLAGS build/offsets.c -o "$OUT/offsets-gen.js" -sENVIRONMENT=node
node "$OUT/offsets-gen.js" >"$OUT/registers.json"
rm -f "$OUT/offsets-gen.js" "$OUT/offsets-gen.wasm"

echo "done -> $OUT/$NAME.mjs (default export: $EXPORT_NAME), $OUT/$NAME.wasm, $OUT/registers.json"
