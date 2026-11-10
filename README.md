# Skills Launcher

[![cross-platform](https://github.com/RodrigoKuerten/skills-launcher/actions/workflows/cross-platform.yml/badge.svg?branch=main)](https://github.com/RodrigoKuerten/skills-launcher/actions/workflows/cross-platform.yml)

One library for every AI agent. Skills Launcher is a desktop-first universal skills manager: discover skills from
verifiable sources, inspect provenance and security findings, install them into the agents you actually have, and keep
them current with backups and rollback.

> Automated scans are heuristics, not a security guarantee. Compatibility badges describe Agent Skills format support,
> not a promise that a specific agent build will load every field. macOS/Linux builds are not validated yet.

## Desktop app (primary product)

Built with Tauri 2, React 19, TypeScript, Tailwind CSS 4, Rust and SQLite. The desktop app does **not** require Node,
the web app, or the legacy companion to run.

```bash
npm install
npm run dev:desktop      # Vite + Tauri dev window
npm run build:desktop    # Windows NSIS installer under apps/desktop/src-tauri/target/release/bundle
```

The Windows build needs Rust and the MSVC C++ build tools. `scripts/tauri-with-msvc.mjs` imports `vcvars64.bat` so a
normal shell can build.

### What the desktop app does

- **Catalog**: SQLite with sources, immutable versions, provenance, categories, trust, risk/security findings and
  compatibility; search, filters and sorts.
- **Sources**: extensible Rust adapters for GitHub repositories, GitHub organizations, local directories, ZIP files,
  HTTPS Git repositories and versioned HTTP JSON catalogs. Add/edit/remove/enable/disable/sync, auto-sync and JSON
  import/export.
- **Agents**: evidence-based detection for Claude Code, OpenAI Codex, OpenCode, Cursor, GitHub Copilot, Gemini CLI and
  Windsurf. A config folder alone is never treated as an installation.
- **Install lifecycle**: one-click install to one or many detected agents, update, uninstall, backup, rollback and an
  operation log. Existing untracked user files survive updates; old managed files are removed.
- **Security**: imported content is untrusted data. Paths are validated, symlinks/reparse points and ZIP traversal are
  rejected, archives and files are size-capped, static findings are stored per version, suspicious versions require an
  explicit override, and imported scripts are never executed.
- **UI**: dark-first Home, Explore, Categories, Library, Updates, My Agents, Sources, Activity and Settings using the
  blue ribbon “S” logo and palette.

The local database and backups live in the Tauri app-data directory. GitHub tokens are held in memory for the current
session only; they are never written to SQLite.

### Repository layout

```
apps/desktop/          Tauri 2 + React desktop app (primary)
  src/                 React UI
  src-tauri/           Rust backend, adapters, SQLite, install engine
apps/web/              optional Next.js marketplace/reference implementation (legacy companion flow)
apps/agent/            legacy Node companion for the web app; not used by desktop
packages/core/         TypeScript reference domain logic; not imported by Rust
docs/                  plan, sources, agents, IPC contract, research and ADRs
```

### Tests and verification

```bash
npm run typecheck -w @skills-launcher/desktop
npm run ui:build -w @skills-launcher/desktop
cd apps/desktop/src-tauri
cargo test
```

Rust tests cover local catalog sync, prompt-injection quarantine, install/update with user extras and backups, rollback,
ZIP traversal, path validation and private-address rejection. Network smoke tests are opt-in (`--ignored`).

## Optional web marketplace

The original Next.js marketplace and Node companion remain in the repository as a reference/optional remote catalog.
They are not a prerequisite for the desktop app and are not migrated into the desktop database automatically.

```bash
npm run db:push
npm run db:seed
npm run dev              # http://localhost:3000
```

Legacy companion commands (`npm run agent`, `npm run agent:cli`) still exist for the web application. Desktop installs
do not use the loopback companion.

## Documentation

- `docs/DESKTOP_PLAN.md` — scope, architecture boundaries and visual identity
- `docs/IPC_CONTRACT.md` — desktop command contract
- `docs/SOURCES.md` — adapter configs, limits and scanner rules
- `docs/AGENTS.md` — host matrix, detection evidence, install/backup/rollback
- `docs/SECURITY.md` — security boundaries and residual risks
- `docs/AUDIT.md` — Playwright design audit and screenshots
- `docs/CI.md` — Linux/macOS/Windows build and launch evidence
- `docs/research/competitors.md` — source-linked competitor/license research
- `docs/ARCHITECTURE.md` — earlier web/companion architecture

## License

Application code: MIT. Imported skills retain their original licenses and attribution; check each skill’s source and
license before redistributing it.
