# Cross-platform verification

Workflow: `.github/workflows/cross-platform.yml`

Latest fully green `main` run: <https://github.com/RodrigoKuerten/skills-launcher/actions/runs/42926651082>  
Commit: `c8f3dce9cee04d86b5847fef5d40357d9d6add4c`

| Job | Runner | Result |
| --- | --- | --- |
| `test / ubuntu-latest` | Ubuntu 24.04 | success |
| `test / macos-latest` | macOS arm64 | success |
| `test / windows-latest` | Windows | success |
| `runtime / linux` | Ubuntu 24.04 + Xvfb/DBus | success |
| `runtime / macos` | macOS arm64 GUI session | success |

## Test jobs

Every OS runs `npm ci`, the desktop TypeScript check, the Vite production build and `cargo test`.

- Rust: 9 passing, 5 ignored. The ignored tests are network/machine diagnostics.
- Linux and macOS additionally install `opencode-ai@1.19.5` from npm and run
  `real_opencode_detect_install_uninstall` with `SKILLS_LAUNCHER_EXPECT_OPENCODE=1`.
- Real OpenCode evidence from the green run:
  - Ubuntu: executable `/opt/hostedtoolcache/node/24.22.2/x64/bin/opencode`, version `1.19.5`,
    skills root `/home/runner/.config/opencode/skills`.
  - macOS: executable `/Users/runner/hostedtoolcache/node/24.22.2/arm64/bin/opencode`, version `1.19.5`,
    skills root `/Users/runner/.config/opencode/skills`.
- That test detects the installed CLI, syncs a temporary local skill, installs it into the real OpenCode user
  root, verifies `SKILL.md`, then uninstalls it and verifies the folder is gone.

## GUI runtime jobs

The runtime jobs build through the Tauri CLI (`npm run build:exe`, which runs `tauri build --no-bundle`) so the
frontend is embedded. A direct `cargo build --release` was tested first and correctly failed the new render check:
the WebView showed `Could not connect to localhost`, because the dev URL was still active.

- Linux: installs WebKitGTK 4.1, GTK3, appindicator, Xvfb, DBus, xdotool, ImageMagick and X11 utilities; launches
  the release binary under `dbus-run-session` + `xvfb-run` on a 1600x1000 virtual screen.
  - Real window found: `1320x860`.
  - Window screenshot rendered with grayscale standard deviation `0.0985792` and the process stayed alive.
- macOS: launches the release binary in the runner GUI session, locates the on-screen window through CoreGraphics,
  captures that window with `screencapture -l`, and checks the PNG's grayscale standard deviation.
  - Captured window PNG: `1136x786` (window plus frame/shadow), above the configured `980x640` minimum.
  - Rendered standard deviation: `0.198919`; the process stayed alive.
- Both jobs upload the screenshot and app log as Actions artifacts. The rendered images are also committed:
  - [Linux Home](audit/linux-home.png)
  - [macOS Home](audit/macos-home.png)

## Windows installed-app source sync

The rebuilt NSIS installer was installed over the existing 0.2.0 install and opened through WebView2 remote debugging.
A real click on **Sync all** populated the existing database from the 11 seeded sources:

- 11 sources, **377 catalog skills**, 12 categories.
- 9 `QUARANTINED`; 27 total high/critical or quarantined.
- 0 console errors.
- Screenshot: [Windows Home, 11 sources](audit/windows-home-11-sources.png).

The existing 105 skills from the original five sources were preserved; the six new sources added 272 skills.

## What this proves

- The Tauri release build starts and renders the actual React UI on Linux (WebKitGTK) and macOS (WKWebView).
- The window is real, mapped, at the configured size, and its content is not a blank/error screen.
- A real native agent (`opencode` 1.19.5) is detected and its documented Linux/macOS install path is exercised
  end to end in the shared Rust install engine.
- The shared Rust tests and frontend build pass on Windows, Linux and macOS.

## Limits

- Only OpenCode was installed. Claude Code, Codex, Cursor, Copilot, Gemini CLI and Windsurf are not validated on
  Linux/macOS yet.
- The GUI check verifies rendering and process stability; it does not click through app flows or assert individual
  DOM elements on Linux/macOS.
- Linux runs in Xvfb, not a physical desktop/compositor. macOS runs in a GitHub-hosted VM, not physical hardware.
- No `.deb`, AppImage or `.dmg` installer is produced by this workflow. Windows NSIS remains the only packaged
  installer that has been installed interactively.
- Screenshot/window checks are limited to the Home route on a clean database.
