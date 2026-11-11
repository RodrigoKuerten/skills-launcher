#!/usr/bin/env bash
# Runs inside dbus-run-session + xvfb-run. Verifies a mapped window and a non-blank render.
set -euo pipefail

binary="${1:?usage: gui-smoke-linux.sh <binary> <evidence-dir>}"
evidence="${2:?usage: gui-smoke-linux.sh <binary> <evidence-dir>}"
mkdir -p "$evidence"
log="$evidence/app.log"
screenshot="$evidence/window.png"

"$binary" >"$log" 2>&1 &
pid=$!
cleanup() {
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}
trap cleanup EXIT

window=""
for _ in $(seq 1 30); do
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "app exited before opening a window" >&2
    cat "$log" >&2
    exit 1
  fi
  candidates="$(xdotool search --name 'Skills Launcher' 2>/dev/null || true)"
  if [ -z "$candidates" ]; then
    candidates="$(xdotool search --class 'skills-launcher' 2>/dev/null || true)"
  fi
  for candidate in $candidates; do
    WIDTH=0
    HEIGHT=0
    eval "$(xdotool getwindowgeometry --shell "$candidate" 2>/dev/null || true)"
    if [ "${WIDTH:-0}" -ge 980 ] && [ "${HEIGHT:-0}" -ge 640 ]; then
      window="$candidate"
      break 2
    fi
  done
  sleep 1
done

if [ -z "$window" ]; then
  echo "Skills Launcher main window was not found at the configured minimum size (980x640)" >&2
  cat "$log" >&2
  xwininfo -root -tree 2>&1 | head -n80 >&2 || true
  exit 1
fi

eval "$(xdotool getwindowgeometry --shell "$window")"
echo "window=$window size=${WIDTH}x${HEIGHT}"

# Let React finish its first paint before capturing.
sleep 2
if ! import -window "$window" "$screenshot" 2>/dev/null; then
  xwd -silent -id "$window" -out "$evidence/window.xwd"
  convert "$evidence/window.xwd" "$screenshot"
  rm -f "$evidence/window.xwd"
fi
identify "$screenshot"
stddev="$(convert "$screenshot" -colorspace Gray -format '%[fx:standard_deviation]' info:)"
echo "render stddev=$stddev"
awk -v value="$stddev" 'BEGIN { if (value < 0.005) exit 1 }' || {
  echo "window render is effectively blank" >&2
  exit 1
}

sleep 6
if ! kill -0 "$pid" 2>/dev/null; then
  echo "app exited during the GUI smoke test" >&2
  cat "$log" >&2
  exit 1
fi
echo "GUI smoke passed: window rendered and process stayed alive"
