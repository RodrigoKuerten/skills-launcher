# Design audit

Method: the release Tauri app is launched with WebView2 remote debugging enabled, then Playwright connects over CDP to
the real window. Screenshots and console errors are captured from the running app, not a mocked browser preview. An
independent React UI review ran alongside the implementation.

```powershell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"
# launch apps/desktop/src-tauri/target/release/skills-launcher.exe
npm run audit:ui -w @skills-launcher/desktop
```

Outputs: `docs/audit/before/*.png` (baseline), `docs/audit/*.png` (after), and a route/console summary. The final run
reported **0 console errors**.

## Evidence

- Re-synced the five seeded official sources from a clean local database: **105 real skills**, 5 sources, 12 categories,
  2 quarantined versions; no sample rows.
- Real Windows detection: OpenCode is the only detected host (runtime evidence `opencode-cli`); Claude Code, Codex,
  Cursor, Copilot, Gemini CLI and Windsurf correctly remain not-detected from config/skills folders alone.
- UI install/uninstall into OpenCode was exercised through the skill-detail sheet; Library, Downloads and filesystem
  state updated correctly. The installed-state screenshot is `skill-detail-installed.png`; the test install was removed.
- Screenshots: `home`, `explore`, `explore-search`, `categories`, `library`, `updates`, `agents`, `sources`, `downloads`,
  `settings`, `skill-detail`, `skill-detail-readme`, `skill-detail-installed`, `source-form`, `home-light`,
  `home-980x640`.
- Windows NSIS installer built, silently installed, launched from `%LOCALAPPDATA%\Skills Launcher`, uninstalled and
  reinstalled successfully. The installed build reports 5 sources / 105 skills / 0 installations from the real DB.

## Improvements made during the audit

- Replaced the previous violet placeholder accent with the logo’s near-black/blue/cyan palette, in the desktop and site.
- Introduced an opaque secondary-text token, removed alpha-muted body text, increased metadata sizes, and collapsed the
  typography scale. The sidebar/desktop header heights now align.
- Reworked Home: one global sync action, one last-sync indicator, no duplicated official-source panel; real featured
  skills and a compact open-ecosystem entry point.
- Renamed navigation to the requested **Home** and **Downloads** structure; page headings now rely on the topbar
  breadcrumb instead of repeating an eyebrow.
- Compacted My Agents: detected runtime gets one full-width evidence card; undetected hosts use a compact reference
  list instead of six oversized empty cards.
- Made install explicit: one detected host is selected by default, rescans preserve selection, the footer names the host,
  and existing installs show an Installed state with Open Library/Reinstall.
- Simplified SkillCard: name first, metadata demoted, low-risk/100-score noise removed, host dots replaced with a plain
  agent count, and installed skills get a badge.
- Reconciled Explore’s counts: `103 of 105`, a truthful `Include quarantined (2)` control, filter chips, stronger focus
  rings, and pagination scroll-to-results. Zero-skill categories are no longer clickable dead ends.
- Removed dead/duplicate actions: global sync only, no “Update selected” when there are no updates, one empty-Library
  primary action, no fake filter glyph.
- Added accessible tab focus/arrow handling, stronger form focus rings, toast deduplication, README table rendering with
  frontmatter removed, and no nested README scroll trap.
- Normalized non-SPDX license strings to `See LICENSE`; trust labels now state that they are self-declared source labels.
- Kept compact/icon-only sidebar at 980×640 and verified both dark and light palettes; reduced-motion support remains.

## Residual limits

- Windows/WebView2 is the only runtime exercised. Linux/macOS descriptors exist but were not run on real runners.
- Project-scope install is not implemented; only user-level skill roots are written.
- No screenshots from a real second monitor/DPI setup; layout tested at 1320×860 and 980×640.
- Form dirty-state protection and a full WAI-ARIA radio group for theme cards are still future polish.
- No remote catalog/account sync; the optional web marketplace is separate.
