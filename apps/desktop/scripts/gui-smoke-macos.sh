#!/usr/bin/env bash
# Runs in the macOS runner GUI session. Verifies a real on-screen window and captures evidence.
set -euo pipefail

binary="${1:?usage: gui-smoke-macos.sh <binary> <evidence-dir>}"
evidence="${2:?usage: gui-smoke-macos.sh <binary> <evidence-dir>}"
mkdir -p "$evidence"
log="$evidence/app.log"
screenshot="$evidence/screen.png"

"$binary" >"$log" 2>&1 &
pid=$!
cleanup() {
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
}
trap cleanup EXIT

sleep 8
if ! kill -0 "$pid" 2>/dev/null; then
  echo "app exited before opening a window" >&2
  cat "$log" >&2
  exit 1
fi

cat > "$evidence/window-check.swift" <<'SWIFT'
import CoreGraphics
import Darwin
import Foundation

let options: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID) as? [[String: Any]] ?? []
for window in windows {
    let owner = window[kCGWindowOwnerName as String] as? String ?? ""
    let title = window[kCGWindowName as String] as? String ?? ""
    let layer = window[kCGWindowLayer as String] as? Int ?? -1
    guard layer == 0 else { continue }
    if owner.lowercased().contains("skills") || title.lowercased().contains("skills") {
        let bounds = window[kCGWindowBounds as String] ?? [:]
        print("window owner=\(owner) title=\(title) bounds=\(bounds)")
        exit(0)
    }
}
FileHandle.standardError.write(Data("Skills Launcher window was not found\n".utf8))
exit(1)
SWIFT
swift "$evidence/window-check.swift"

screencapture -x "$screenshot"
sips -g pixelWidth -g pixelHeight "$screenshot"
bytes="$(stat -f%z "$screenshot")"
echo "screenshot bytes=$bytes"
if [ "$bytes" -lt 1000 ]; then
  echo "screenshot is unexpectedly small" >&2
  exit 1
fi

sleep 2
if ! kill -0 "$pid" 2>/dev/null; then
  echo "app exited during the GUI smoke test" >&2
  cat "$log" >&2
  exit 1
fi
echo "GUI smoke passed: macOS window found and screenshot captured"
