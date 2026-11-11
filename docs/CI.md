# Cross-platform verification

Workflow: `.github/workflows/cross-platform.yml`

Latest fully green `main` run: <https://github.com/RodrigoKuerten/skills-launcher/actions/runs/43100847158>
Commit: `4c3dd0ad4bcaedb2c3e5ef14e6f450c1f8f6fa2e`

| Job | Runner | Result |
| --- | --- | --- |
| `test / ubuntu-24.04` | Ubuntu 24.04 | success |
| `test / ubuntu-26.04` | Ubuntu 26.04 | success |
| `test / macos-latest` | macOS arm64 | success |
| `test / windows-latest` | Windows | success |
| `agents / ubuntu-24.04` | Ubuntu 24.04 | success |
| `agents / ubuntu-26.04` | Ubuntu 26.04 | success |
| `agents / macos` | macOS arm64 | success |
| `linux-e2e / ubuntu-24.04` | Ubuntu 24.04 package install + GUI | success |
| `runtime / linux-24.04` | Ubuntu 24.04 + Xvfb/DBus | success |
| `runtime / linux-26.04` | Ubuntu 26.04 + Xvfb/DBus | success |
| `runtime / macos` | macOS arm64 GUI session | success |

## Shared tests

All four test jobs run `npm ci`, the desktop TypeScript check, the Vite production build and `cargo test`.

- Rust: 9 passing, 5 ignored. The ignored tests are network/machine diagnostics or require explicitly installed agents.
- `cargo clippy --all-targets -- -D warnings` is clean locally; it is not a separate CI step yet.

## Real agent jobs

The `agents` jobs install official packages, not fake executables or empty folders. Each job installs all seven real
agents, then runs `real_agents_detect_install_uninstall` with:

```text
SKILLS_LAUNCHER_EXPECT_HOSTS=claude-code,codex,cursor,copilot,gemini-cli,windsurf,opencode
```

The test requires every listed host to be detected, syncs a temporary local skill, installs it into each real user skill
root, verifies `SKILL.md`, uninstalls it and verifies removal.

Versions and evidence from the green run:

| Host | Runtime installed | Detected version | Real install root |
| --- | --- | --- | --- |
| Claude Code | `@anthropic-ai/claude-code@latest` | `2.1.322 (Claude Code)` | `~/.claude/skills` |
| OpenAI Codex | `@openai/codex@latest` | `codex-cli 0.167.1` | `~/.agents/skills` |
| Cursor | official `cursor.com/install` CLI | `2026.11.10-731fb78` (`cursor-agent`) | `~/.cursor/skills` |
| GitHub Copilot | `@github/copilot@latest` | `GitHub Copilot CLI 1.0.109.` | `~/.copilot/skills` |
| Gemini CLI | `@google/gemini-cli@latest` | `0.68.0` | `~/.gemini/skills` |
| Windsurf / Devin Desktop | Debian package `3.12.43` on Linux; Homebrew cask `3.11.238` on macOS | `devin-desktop` detected | `~/.codeium/windsurf/skills` |
| OpenCode | `opencode-ai@latest` | `1.19.5` | `~/.config/opencode/skills` |

The same test passed on Ubuntu 24.04, Ubuntu 26.04 and macOS arm64. Cursor is detected through the official
`cursor-agent` symlink; Windsurf is detected through the current `devin-desktop` release while retaining the documented
Windsurf skills root.

## GUI runtime jobs

The runtime jobs build through the Tauri CLI (`npm run build:exe`, which runs `tauri build --no-bundle`) so the frontend
is embedded. A direct `cargo build --release` was tested earlier and correctly failed the render check: the WebView showed
`Could not connect to localhost` because the dev URL was still active.

- Linux 24.04: window `1320x860`, non-blank render `stddev 0.0984981`.
- Linux 26.04: window `1320x860`, non-blank render `stddev 0.0998979`.
- macOS: captured window PNG `1136x786`, non-blank render `stddev 0.198919`.
- All three keep the process alive after the render check. Artifacts include the screenshot and app log.

Committed screenshots:

- [Linux 24.04 Home](audit/linux-home.png)
- [Linux 26.04 Home](audit/ubuntu-2604-home.png)
- [macOS Home](audit/macos-home.png)

## Windows installed-app source sync

The rebuilt NSIS installer was installed over the existing 0.2.0 install and opened through WebView2 remote debugging.
A real click on **Sync all** populated the existing database from all 23 seeded sources:

- 23 sources, **854 catalog skills**, 12 categories.
- 14 `QUARANTINED`; 38 total high/critical or quarantined.
- 0 console errors.
- Screenshot: [Windows Home, 23 sources](audit/windows-home-23-sources.png).

The existing catalog was preserved; after adding the 12 new sources, the installed app reached 854 skills with 23
sources.

## Linux package E2E

`linux-e2e / ubuntu-24.04` closes the packaging gap:

1. builds the Tauri `.deb` and AppImage;
2. installs the `.deb` with `apt-get`;
3. runs `seeded_sources_sync_smoke` against all 23 seeded sources;
4. launches the **installed** `/usr/bin/skills-launcher` binary under Xvfb/DBus and verifies a rendered window.

The 23-source sync completed with the expected catalog, and the installed package window rendered successfully.
Screenshot: [Linux installed package](audit/linux-e2e-installed.png).

## What this proves

- The Tauri release build starts and renders the real React UI on Ubuntu 24.04, Ubuntu 26.04 and macOS.
- The Linux `.deb` installs and the installed binary launches under Xvfb; all 23 seeded sources sync on Linux.
- The shared Rust tests and frontend build pass on Windows, Ubuntu 24.04, Ubuntu 26.04 and macOS.
- All seven supported agent hosts are detected from real runtimes and their documented user install roots are exercised
  end to end on Ubuntu 24.04, Ubuntu 26.04 and macOS.

## Limits

- The agent test installs and removes a temporary skill in each host root; it does not run an AI prompt or authenticate
  the agent. No imported skill script is executed.
- The GUI check verifies rendering and process stability; it does not click through app flows or assert individual DOM
  elements on Linux/macOS. Windows had one real click-driven `Sync all` flow.
- Linux runs in Xvfb, not a physical desktop/compositor. macOS runs in a GitHub-hosted VM, not physical hardware.
- The Linux `.deb` is installed and launched in CI; the AppImage and macOS `.dmg` are built and published but not
  installed interactively.
- Screenshot/window checks are limited to the Home route on a clean database.
