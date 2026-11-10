# Design audit

Method: the release Tauri app is launched with WebView2 remote debugging enabled, then Playwright connects over CDP to
the real window. Screenshots and console errors are captured from the running app, not a mocked browser preview.

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
# launch apps/desktop/src-tauri/target/release/skills-launcher.exe
npm run audit:ui -w @skills-launcher/desktop
```

Outputs: `docs/audit/<route>-1320x860.png` and a console/routing summary.

## Checks

- Home, Explore, Categories, Library, Updates, My Agents, Sources, Activity, Settings at 1320×860.
- Empty/error states, loading feedback, focus rings, keyboard access and contrast.
- Real IPC only: seeded sources, 105 synced skills, OpenCode detection on the Windows test machine; no sample rows.
- Brand consistency with `public/logo.png` and the blue palette.

## Findings

Filled after the full-UI audit. This file is committed with the screenshots that were actually reviewed.
