#!/usr/bin/env bash
# Render demo stills of the workshop scene with headless chromium and fail on missing PNGs or JS errors.
# Usage: tests/render_scene.sh [outdir]   (env THEME=bg,fg,accent,r,g,y,b,m,c to try another theme)
set -u
cd "$(dirname "$0")/.."
OUT="${1:-${TMPDIR:-/tmp}/claude-workshop-render}"
mkdir -p "$OUT"
PROFILE="$(mktemp -d "$OUT/profile.XXXXXX")"
trap 'rm -rf "$PROFILE"' EXIT
EXTRA=""
[ -n "${THEME:-}" ] && EXTRA="&theme=$THEME"
SUFFIX="${THEME:+-themed}"
# demo name and the moment (ms) to freeze the clock at
SHOTS="all:1700 all:12100 all:18100 all:25900 all:32300 all:40500 all:45800 all:55200 all:60500 burst:8000 burst:60000 two:12000 two:20000 close:10400 close:16900 all:12000@1000x1920 all:12000@1080x1700"
fail=0
for shot in $SHOTS; do
  size=1080,1920
  case "$shot" in *@*) size="${shot##*@}"; size="${size/x/,}"; shot="${shot%@*}";; esac
  demo="${shot%%:*}" at="${shot##*:}"
  png="$OUT/scene-$demo-$at-${size/,/x}$SUFFIX.png"
  rm -f "$png"
  log="$(timeout 60 chromium --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --user-data-dir="$PROFILE" --window-size="$size" --virtual-time-budget=3000 \
    --enable-logging=stderr --v=0 --screenshot="$png" \
    "file://$PWD/web/index.html?static=1&demo=$demo&at=$at$EXTRA" 2>&1)"
  if [ ! -s "$png" ]; then echo "FAIL $demo@$at: no PNG"; fail=1; continue; fi
  if grep -q "Uncaught" <<<"$log"; then echo "FAIL $demo@$at: console error"; grep "Uncaught" <<<"$log"; fail=1; continue; fi
  echo "ok   $png"
done
exit $fail
