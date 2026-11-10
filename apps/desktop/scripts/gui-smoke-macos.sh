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
        let number = window[kCGWindowNumber as String] as? Int ?? 0
        print("window_id=\(number) owner=\(owner) title=\(title) bounds=\(bounds)")
        exit(0)
    }
}
FileHandle.standardError.write(Data("Skills Launcher window was not found\n".utf8))
exit(1)
SWIFT
window_info="$(swift "$evidence/window-check.swift")"
printf '%s\n' "$window_info"
window_id="$(printf '%s\n' "$window_info" | sed -n 's/.*window_id=\([0-9][0-9]*\).*/\1/p' | head -n1)"
if [ -z "$window_id" ]; then
  echo "could not read the Skills Launcher window id" >&2
  exit 1
fi

screencapture -x -l "$window_id" "$screenshot"
sips -g pixelWidth -g pixelHeight "$screenshot"
bytes="$(stat -f%z "$screenshot")"
echo "screenshot bytes=$bytes"
if [ "$bytes" -lt 1000 ]; then
  echo "screenshot is unexpectedly small" >&2
  exit 1
fi

cat > "$evidence/image-stats.swift" <<'SWIFT'
import CoreGraphics
import Darwin
import Foundation
import ImageIO

let path = CommandLine.arguments[1]
guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil)
else {
    FileHandle.standardError.write(Data("could not read screenshot\n".utf8))
    exit(2)
}
let width = image.width
let height = image.height
var pixels = [UInt8](repeating: 0, count: width * height * 4)
var drewImage = false
pixels.withUnsafeMutableBytes { buffer in
    guard let context = CGContext(data: buffer.baseAddress, width: width, height: height,
                                  bitsPerComponent: 8, bytesPerRow: width * 4,
                                  space: CGColorSpaceCreateDeviceRGB(),
                                  bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return }
    context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    drewImage = true
}
guard drewImage else { exit(2) }
var sum = 0.0
var sumSquared = 0.0
for index in stride(from: 0, to: pixels.count, by: 4) {
    let luminance = 0.2126 * Double(pixels[index])
        + 0.7152 * Double(pixels[index + 1])
        + 0.0722 * Double(pixels[index + 2])
    sum += luminance
    sumSquared += luminance * luminance
}
let count = Double(width * height)
let mean = sum / count
let variance = max(0, sumSquared / count - mean * mean)
let deviation = sqrt(variance) / 255.0
print(String(format: "render stddev=%.6f", deviation))
if deviation < 0.005 {
    FileHandle.standardError.write(Data("window render is effectively blank\n".utf8))
    exit(1)
}
SWIFT
swift "$evidence/image-stats.swift" "$screenshot"

sleep 2
if ! kill -0 "$pid" 2>/dev/null; then
  echo "app exited during the GUI smoke test" >&2
  cat "$log" >&2
  exit 1
fi
echo "GUI smoke passed: macOS window found and screenshot captured"
