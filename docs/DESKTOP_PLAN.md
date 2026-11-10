# Skills Launcher — Desktop Pivot Plan

## Goal

Skills Launcher is a desktop-first universal AI skills manager: discover, import, inspect, install, update and roll back
Agent Skills from extensible sources, detect installed AI agents on Windows/Linux/macOS, and keep provenance and safety
signals.

## Visual identity

The app icon and site mark are the blue ribbon “S” on a near-black rounded square (`src-tauri/icon-source.png`,
`public/logo.png`). The interface is dark-first and uses only the mark’s palette:

- canvas `#05070d`, surfaces `#090d16` / `#0d1320`, elevated `#121a2a`, lines `#1c2638`
- brand `#2f6bff`, strong `#2447ff`, soft `#60a5fa`, cyan `#38bdf8`
- signature gradient: `linear-gradient(135deg, #38c6ff 0%, #2f6bff 48%, #2447ff 100%)`
- text `#f5f8ff`, muted `#8b99ad`

Do not introduce violet/purple as a primary accent. Blue is the accent; neutral zinc/blue-black carries structure.

## Stack (fixed)

Tauri 2 · React 19 + TypeScript · Tailwind CSS 4 · shadcn-style components · Rust local backend · SQLite (bundled
rusqlite) · Tauri IPC · optional remote REST catalog. Java/Spring Boot + PostgreSQL is future work, not in the MVP.

## Existing assets and migration

- `apps/web` remains an optional remote catalog/reference implementation, not required for desktop operation.
- `apps/agent` remains the legacy Node companion for the web; the desktop app does **not** depend on it.
- `packages/core` TypeScript logic is a reference, not imported by Rust.
- The new desktop app replaces the static shell/sidecar with a React UI and Rust commands. No Node runtime is required
  for the desktop product.

## MVP scope

1. **Local SQLite catalog** with sources, source runs, skills, versions, compatibility, installations, backups, operations,
   settings and categories.
2. **Extensible source adapters**:
   - GitHub repository (tree + raw, license and metadata, SKILL.md discovery)
   - Local directory
   - ZIP archive
   - Git repository (system Git with argument sanitization; optional if time)
   - HTTP JSON catalog (simple, documented contract)
   - GitHub organization discovery (lists repositories, then repo adapter)
   New adapter = new module implementing the `SourceAdapter` trait; no core edits.
3. **Catalog & discovery**: search, category, source, host compatibility, trust/risk, sort (quality/popular/recent/name),
   detail, versions, provenance, reviews are **not** in the desktop MVP unless backed by local data; no fake ratings.
4. **Universal agent detection**: executable/PATH + documented config paths + app evidence for Codex, Claude Code,
   OpenCode, Cursor, Windsurf, Copilot, Gemini CLI. A directory alone is never proof.
5. **Install/update/remove/rollback** with host adapters, checksum verification, path allowlist, backup, journal and conflict
   detection. Never execute imported code.
6. **Source management**: add/edit/remove/enable/disable, sync, auto-sync interval, import/export source configs, share JSON.
7. **Updates**: compare source snapshots/versions, show change summaries, install individually or in bulk, preserve local
   extra files, backup and rollback.
8. **Safety**: static scan, risk/trust indicators, quarantine suspicious content, license-aware distribution, external link
   and path validation, operation log.
9. **UI**: Home, Explore, Categories, Library, Sources, Updates, My Agents, Downloads/Operations, Settings. Dark first,
   commercial polish, real states and feedback; design audit with Playwright screenshots later.
10. **Offline**: local sources/install operations work without network; remote sync errors are explicit.

## Explicit non-goals for this MVP

- User accounts, payments, remote reviews/ratings, hosted sync, Java backend, PostgreSQL.
- Executing skills or installing their runtime dependencies.
- Claiming compatibility that was not format-validated and locally detected.
- Silent automatic updates when a local file conflict exists.
- In-app plugin runtime for third-party native code (source adapters are compiled Rust modules; plugin ABI is future).

## Architecture boundaries

```
apps/desktop/
  src/                    React UI only (typed IPC client, components, pages)
  src-tauri/src/
    main.rs               Tauri builder, command registration, auto-sync loop
    commands/             thin Tauri command modules (core, sources, agents)
    db.rs                 SQLite schema, migrations, settings, stats, journal
    domain.rs             serializable IPC/domain types
    catalog.rs            source sync persistence, catalog queries, source CRUD
    security.rs           static findings and risk scoring
    sources/              SourceAdapter trait, registry, adapters, parsing
    agents/               host descriptors, detection, installer, backups
    state.rs              shared DB, HTTP, token, path grants, install lock
```

Dependency direction: `ui -> IPC -> commands -> catalog/sources/agents/security/db`. The domain never imports Tauri or
React. Adapters return untrusted bytes; `catalog` owns validation, scanning, hashing and persistence. Only `agents`
writes host directories.

This is a modular monolith instead of the proposed multi-crate workspace. The crate split was rejected for the MVP:
one binary, one build, one test target, explicit module boundaries. Split only when a second binary or independent
release cadence appears.

## Parallel work ownership

| Writer | Owns | Depends on |
| --- | --- | --- |
| Orchestrator | scaffold, IPC contracts, DB schema, Tauri config, integration, design system shell | research/architect |
| Writer A (`general`) | `src-tauri/src/sources/**`, `domain/**`, sync tests | frozen types/schema |
| Writer B (`general`) | `src-tauri/src/agents/**`, install/backup tests | frozen types/schema |
| Writer C (`general`) | React pages/components beyond shell | frozen IPC client/types |
| Reviewers | `rust-reviewer`, `react-reviewer`, `security-reviewer`, `database-reviewer`, `code-reviewer` | read-only |
| Design audit | `react-reviewer` + frontend-design-direction/design-system skills; Playwright screenshots | working Vite preview |

## Acceptance checks

Current Windows evidence (2026-11-10):

- Source sync smoke against a fresh database imports **377 real skills** from the **11 seeded sources** (9 quarantined,
  0 invented rows). The original five-source Windows audit imported 105; the six added sources bring the catalog to 377.
- Local source sync, security quarantine, install/update with user extras, backups, rollback, ZIP traversal and path
  validation pass in `cargo test` (9 passing) and `cargo clippy -- -D warnings`.
- Real detection on this machine reports only OpenCode (runtime evidence); config/skills folders alone stay
  not-detected. UI install/uninstall into OpenCode was exercised end to end.
- `npm run build:desktop` produces the NSIS installer; it was installed, launched, uninstalled and reinstalled.
- React typecheck/build, site typecheck/build, Playwright WebView2 audit at 1320×860 / 980×640, dark and light themes,
  and `npm audit` (0 vulnerabilities) pass. Playwright console errors: 0.
- Source deletion is soft, backups are integrity-checked before restore, and imported code is never executed.

Remaining acceptance checks:

- UI import/export round-trip against a second install (backend parsing is tested, UI flow is not automated).
- Linux/macOS click-through GUI flows and the remaining agent hosts. CI already validates the real window render,
  OpenCode 1.19.5 detection/install/uninstall and the shared tests; it does not automate interactions or install
  Claude Code, Codex, Cursor, Copilot, Gemini CLI or Windsurf there.
- Project-scope installs and code signing are future work.
- No remote URL, source content or skill file is rendered as raw HTML.
