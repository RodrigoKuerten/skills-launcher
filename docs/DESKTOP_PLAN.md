# Skills Launcher — Desktop Pivot Plan

## Goal

A desktop-first Universal AI Skills Manager: discover, import, inspect, install, update and roll back Agent Skills from
extensible sources, detect installed AI agents on Windows/Linux/macOS, and keep provenance and safety signals.

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
  src/                    React UI only (IPC client, components, pages)
  src-tauri/src/
    lib.rs/main.rs        Tauri commands + app setup (thin)
    db/                   SQLite schema, migrations, repositories
    domain/               types, errors, hashes, parser, scan, versioning
    sources/              SourceAdapter trait, registry, adapters, sync engine
    agents/               AgentAdapter trait, detection, installer, backups
    operations/           journal + rollback orchestration
    settings/             app settings
```

Dependency direction: `ui -> IPC -> commands -> domain/sources/agents/db`. Domain never imports Tauri or React.
Adapters never touch the DB directly; the sync/install services own persistence.

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

- `cargo test` for parser/hash/scan/source selection/agent adapter/install rollback.
- `npm test`/`cargo test` and `npm run build:desktop` pass.
- Real source sync from at least one GitHub repo and one local directory; no invented rows.
- Detection reports honest evidence on Windows; OpenCode detected if present.
- Install into a temporary host root in tests; update preserves extra file; rollback restores.
- No remote URL, source content or skill file is rendered as raw HTML.
- Source import/export round-trips.
- UI build and visual audit via Playwright at 1440x900 and 390x844.
- Windows installer built; Linux/macOS builds documented as unverified without runners.
