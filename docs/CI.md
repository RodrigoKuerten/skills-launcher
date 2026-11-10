# Cross-platform verification

Workflow: `.github/workflows/cross-platform.yml`

First fully green branch run: <https://github.com/RodrigoKuerten/skills-launcher/actions/runs/42922366809>
Commit: `21ce402646c5cbb30a865566497f7cc4d166c63f`

First fully green `main` run: <https://github.com/RodrigoKuerten/skills-launcher/actions/runs/42923443073>
Commit: `c1378a36bfb4e1e5de8868a34a3a0c8e554c5f50`

| Job | Runner | Result |
| --- | --- | --- |
| `test / ubuntu-latest` | Ubuntu 24.04 | success |
| `test / macos-latest` | macOS arm64 | success |
| `test / windows-latest` | Windows | success |
| `runtime / linux` | Ubuntu 24.04 | success |
| `runtime / macos` | macOS arm64 | success |

## What the jobs actually run

- `npm ci`, desktop typecheck and Vite production build on every OS.
- `cargo test` from `apps/desktop/src-tauri` on Ubuntu, macOS and Windows (8 passing; network/machine smoke tests
  remain opt-in/ignored).
- Linux: installs WebKitGTK 4.1, GTK3, appindicator and Xvfb; builds the Tauri release binary; launches it for 10
  seconds under `dbus-run-session` + `xvfb-run`. The job fails if the process exits before the smoke period.
- macOS: builds the Tauri release binary and launches it for 10 seconds. The job fails on an early exit.
- Rust cache and Node 24 are used; the macOS runtime job intentionally uses `macos-latest` because `macos-14` was
  cancelled by the runner pool before starting.

## Interpretation and limits

- This validates **compilation and process launch** on Linux and macOS, plus the shared Rust tests and frontend build.
- It does **not** prove visual parity, WebKitGTK rendering, macOS window behavior, agent detection or installation on
  those systems. No real Linux/macOS agent binaries were present on the runners.
- Windows was already exercised interactively with the real installed NSIS app, OpenCode detection and a real
  install/uninstall.
- The workflow is the repeatable gate for future changes; local Windows validation remains necessary for host-specific
  behavior.
