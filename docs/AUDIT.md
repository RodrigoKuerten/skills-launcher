# Design audit

Method: the release Tauri app is launched with WebView2 remote debugging enabled, then Playwright connects over CDP to
the real window. Screenshots and console errors are captured from the running app, not a mocked browser preview.

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
# launch apps/desktop/src-tauri/target/release/skills-launcher.exe
npm run audit:ui -w @skills-launcher/desktop
```

Outputs: `docs/audit/*.png` plus a route/console summary. The final run reported **0 console errors**.

## Evidence

- Removed the previous ad-hoc test DB and re-synced the five seeded official sources: **105 real skills**, 5 sources,
  12 categories, 2 quarantined versions; no sample rows.
- Real Windows detection: OpenCode is the only detected host (runtime evidence `opencode-cli`); Claude Code, Codex,
  Cursor, Copilot, Gemini CLI and Windsurf correctly remain not-detected from config/skills folders alone.
- Real UI install/uninstall into OpenCode was exercised through the skill-detail sheet; Library, Activity and filesystem
  state updated correctly, then the test install was removed.
- Screenshots: `home`, `explore`, `explore-search`, `categories`, `library`, `updates`, `agents`, `sources`, `activity`,
  `settings`, `skill-detail`, `skill-detail-readme`, `source-form`, `home-light`, `home-980x640`.

## Improvements made during the audit

- Replaced the previous violet placeholder accent with the logo’s near-black/blue/cyan palette, in the desktop and site.
- Fixed Settings to match the real backend contract; removed the unused remote-catalog field instead of shipping a dead
  control.
- Normalized non-SPDX license strings to `See LICENSE` so cards no longer show “Complete terms in LICENSE.txt”.
- Stripped YAML frontmatter from the README viewer, added safe table/list/code rendering, and stopped rendering the full
  markdown body as the short description.
- Hid REMOVED installations from Library and skill details; added uninstall/rollback error toasts.
- Aligned source-form validation with the HTTPS-only backend and clarified local/ZIP import grant behavior.
- Renamed the per-agent switch to **Auto-update**, matching what the backend actually does after a source sync.
- Added `At risk` labeling (high risk or quarantined) instead of calling all of them “Blocked”.
- Kept compact/icon-only sidebar at 980×640 and verified light-theme persistence.

## Residual limits

- Windows/WebView2 is the only runtime exercised. Linux/macOS descriptors exist but were not run on real runners.
- Project-scope install is not implemented; only user-level skill roots are written.
- No screenshots from a real second monitor/DPI setup; layout tested at 1320×860 and 980×640.
- No remote catalog/account sync; the optional web marketplace is separate.
