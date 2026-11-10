# Competitor research: AI skill managers

Snapshot 2026-11-09; stats from the GitHub API, commits are HEAD. Claims link to inspected sources; inferences are **unverified**.

## 1. Skills Manager

[xingkongliang/skills-manager](https://github.com/xingkongliang/skills-manager) — MIT, Tauri 2.10 + React 19 + TypeScript + Rust, SQLite via `rusqlite`. v1.43.3, `main` @ [`aa87084`](https://github.com/xingkongliang/skills-manager/commit/aa870843b7c1cab8383323105b0fed35d97ec4f2) (2026-11-09), 7.4k stars, 251 open issues.

**Architecture.** `src/views` (Library, InstallSkills, Workspace, Backup, Settings), `src/components`, and a Rust backend split into `commands/` and `core/` (installer, scanner, sync engine, git backup/merge, adapters, path guard) ([tree](https://github.com/xingkongliang/skills-manager/tree/main), [Cargo.toml](https://github.com/xingkongliang/skills-manager/blob/main/src-tauri/Cargo.toml)).

**Data model.** [`skill_store.rs`](https://github.com/xingkongliang/skills-manager/blob/main/src-tauri/src/core/skill_store.rs) defines `skills` (`source_type`, `source_ref`, resolved ref, subpath, branch, revision, `remote_revision`, `central_path`, `content_hash`, `update_status`), `skill_targets` (tool, target path, symlink/copy, sync status), `scenarios` (presets), projects, discovered skills, and an audit log. Library defaults to `~/.skills-manager` ([README](https://github.com/xingkongliang/skills-manager#readme)).

**Sources/lifecycle.** Git repos, local folders, `.zip`/`.skill`, and skills.sh. Detection accepts `SKILL.md` and legacy `skill.md`, never `README.md`/`CLAUDE.md` ([format spec](https://github.com/xingkongliang/skills-manager/blob/main/docs/skill-format-detection-spec.md)). Install defaults to library-only; deploy by symlink or copy. Update re-fetches and replaces the directory wholesale but holds back local-only file removals; `check` is the dry run ([manage-skills](https://github.com/xingkongliang/skills-manager/blob/main/skills/manage-skills/SKILL.md)). Rollback is library-level via Git snapshots, not per-skill versions.

**Agents/cross-platform.** `ToolAdapter` rows declare skill dir, detect dir, extra scan dirs, project override and recursive scan; detection is path existence, plus custom tools and per-agent path overrides ([tool_adapters.rs](https://github.com/xingkongliang/skills-manager/blob/main/src-tauri/src/core/tool_adapters.rs)). Home/config dirs, Windows junctions, `.exe` handling.

**Security/limits.** Name sanitization and canonicalized path containment ([path_guard.rs](https://github.com/xingkongliang/skills-manager/blob/main/src-tauri/src/core/path_guard.rs)), SHA-256 hashes, AES-GCM-encrypted sensitive settings, OS-keyring credentials, repo locks, audit log. The skills.sh integration scrapes Next.js HTML because the public API needs Vercel OIDC ([skillssh_api.rs](https://github.com/xingkongliang/skills-manager/blob/main/src-tauri/src/core/skillssh_api.rs)) — brittle. MIT: reuse with notice.

## 2. Skill Deck

[Hccake/skill-deck](https://github.com/Hccake/skill-deck) — Apache-2.0, Tauri 2 + React 19 + TypeScript + Rust. v1.8.0, `main` @ [`2c920e3`](https://github.com/Hccake/skill-deck/commit/2c920e3244c930804b2d285680d43d53ac5f03a7) (2026-10-23), 36 stars, no open issues.

**Architecture.** Two WebViews share one Rust runtime with separate capabilities. Layers: `commands/` → `application/` → `core/`, `environment/`, `storage/`, `runtime/`; crates `environment-engine`, `environment-protocol`, `wsl-environment-worker`; typed IPC via `tauri-specta` ([architecture](https://github.com/Hccake/skill-deck/blob/main/docs/architecture.md)). No SQL: atomic JSON documents plus `skills` CLI-compatible locks ([ADR-0010](https://github.com/Hccake/skill-deck/blob/main/docs/adr/0010-use-single-writer-library-persistence.md)).

**Data model.** Environment (host OS or WSL distro) → Scope (global/project) → direct installs and Skill Libraries. Libraries are ordered and applied; versions are elected per physical directory and identical content is read once ([lifecycle](https://github.com/Hccake/skill-deck/blob/main/docs/skill-lifecycle.md)). Sources: GitHub/GitLab/Azure, Git refs including full commit SHA, local dirs, well-known indexes, raw `SKILL.md`, zip/tar, and parsed `skills add` commands ([parser](https://github.com/Hccake/skill-deck/blob/main/src-tauri/src/core/source_parser.rs)).

**Lifecycle.** Discovery → preview → confirm → re-check → execute; snapshots are leased 30 min, capped at 32 sessions/512 MiB; archives reject absolute paths, traversal, links, duplicates. Updates preserve agent associations and migrate moved upstream paths; failures keep content and recovery records ([execution](https://github.com/Hccake/skill-deck/blob/main/docs/execution-and-recovery.md), [updates](https://github.com/Hccake/skill-deck/blob/main/docs/update-checking.md)). No user-facing rollback; recovery repairs consistency only.

**Agents/cross-platform.** `AgentDefinition` path specs support Home, ConfigHome, Project, env-var, first-existing and absolute paths; detection is `AnyPathExists`; custom agents allowed. Standard `.agents/skills` vs private dirs, with inferred support confidence ([definition](https://github.com/Hccake/skill-deck/blob/main/src-tauri/src/core/agent_definition.rs), [availability](https://github.com/Hccake/skill-deck/blob/main/src-tauri/src/core/agent_availability.rs)). Windows/WSL/macOS/Linux adapters, junctions, atomic writes. macOS builds are unsigned (README warning).

**Security/license.** User-supplied network sources are trusted client-side, with no SSRF allowlist/DNS filtering ([ADR-0008](https://github.com/Hccake/skill-deck/blob/main/docs/adr/0008-user-provided-network-sources-use-client-trust.md)), but content is digest/size/path validated and writes are preview- and capability-gated. Apache-2.0: reuse with NOTICE/attribution plus patent grant.

## 3. Hydra

[hydralauncher/hydra](https://github.com/hydralauncher/hydra) — MIT, Electron + React + TypeScript + Redux, `classic-level` (LevelDB), Rust libtorrent addon. v4.4.0, `main` @ [`e0a7a79`](https://github.com/hydralauncher/hydra/commit/e0a7a7973321c4768735d65f4447ac3c95bb63ed) (2026-11-09), 17.7k stars, 131 open issues.

**Source model.** `DownloadSource` is only `{id, name, url, status, downloadCount, fingerprint, isRemote, createdAt}` ([types](https://github.com/hydralauncher/hydra/blob/main/src/types/index.ts)). The user pastes a JSON URL; the client never parses it. It POSTs the URL to the Hydra API `/download-sources`, which ingests it and returns the source record ([add source](https://github.com/hydralauncher/hydra/blob/main/src/main/events/download-sources/add-download-source.ts)). Refresh is server-mediated via `/download-sources/sync` and `/download-sources/changes` ([sync](https://github.com/hydralauncher/hydra/blob/main/src/main/events/download-sources/sync-download-sources.ts), [checker](https://github.com/hydralauncher/hydra/blob/main/src/main/services/download-sources-checker.ts)). Source entries are `title`, `uris`, `fileSize` ([#2833](https://github.com/hydralauncher/hydra/issues/2833)).

**Catalog/updates.** The catalogue is Steam-centric: custom sources only attach options to existing catalogue games, so non-Steam entries largely vanish (#2833); ingestion caps are a known complaint ([#2692](https://github.com/hydralauncher/hydra/issues/2692)). Downloads track URI/parts, progress, extraction, resume and seeding. Updates surface only “new download options” badges; per-repack version tracking was proposed but not merged ([#2551](https://github.com/hydralauncher/hydra/pull/2551)). Local-file sources and import/export remain open PRs ([#2632](https://github.com/hydralauncher/hydra/pull/2632), [#2937](https://github.com/hydralauncher/hydra/pull/2937)); an offline badge merged ([#3066](https://github.com/hydralauncher/hydra/pull/3066)).

**UX/security.** Source cards with counts/health; add-by-URL with duplicate checks; “new options” badges; catalogue filters; Big Picture. Third-party JSON is untrusted but server-validated; no signature verification observed; a recent commit added DOMPurify and stricter script sources ([commit](https://github.com/hydralauncher/hydra/commit/e0a7a7973321c4768735d65f4447ac3c95bb63ed)).

## 4. skills.sh

[skills.sh](https://skills.sh/) is Vercel’s directory: leaderboard, trending/hot, semantic/fuzzy search, curated “official” owners, per-skill file tree + SHA-256 hash, security audits from five partners, and `isDuplicate` flags. Install is `npx skills add` ([CLI](https://skills.sh/docs/cli)).

The [API](https://skills.sh/docs/api) is `/api/v1`, JSON, 600 req/min. Auth is **documented only for Vercel deployments via OIDC JWT**; no other flow is documented. Endpoints: list/search/curated/detail/audit. Caching is 30–60 s for lists, 5 min for detail/curated; 429 returns `Retry-After`.

[Terms](https://skills.sh/terms): third-party content, no warranty, “use at your own risk”, rate limits “per IP”, and scraping that bypasses limits may be blocked. This conflicts with the API doc’s per-(team, project) limit; **unverified**. No publish/write API is documented, so a desktop app cannot officially use it.

## 5. Agent Skills specification

[agentskills/agentskills](https://github.com/agentskills/agentskills) — Apache-2.0 code, CC-BY-4.0 docs. `main` @ [`83021e2`](https://github.com/agentskills/agentskills/commit/83021e2be457a9b6679148719c1f6074f0ad975e) (2026-11-04), 27.1k stars.

The [spec](https://agentskills.io/specification) defines a skill directory with `SKILL.md`: YAML frontmatter with required `name` (≤64 chars, lowercase/digits/hyphens, matching the directory, no leading/trailing/double hyphens) and `description` (≤1024 chars); optional `license`, `compatibility` (≤500), `metadata` (string map), `allowed-tools` (experimental). Optional `scripts/`, `references/`, `assets/`; progressive disclosure is core. The [client guide](https://agentskills.io/client-implementation/adding-skills-support) recommends project/user `.<client>/skills/` **and** `.agents/skills/`, but the spec does not mandate install locations, catalogs, versioning, dedupe, trust or source schemas. These are the differentiation space.

## Comparison

| | Skills Manager | Skill Deck | Hydra | skills.sh |
|---|---|---|---|---|
| Stack/storage | Tauri 2 + React + Rust, SQLite | Tauri 2 + React + Rust, JSON + locks | Electron + React + TS, LevelDB + Rust | Next.js service |
| Source schema | Type/ref/branch/subpath/revision/hash | Parsed source + CLI lock fields | Opaque URL; server extracts `{title,uris,fileSize,uploadDate}` | Repo or well-known domain; `id=source/slug` |
| Catalog | skills.sh scrape + local | Local/remote discovery, plugin manifests | Steam catalogue + source options | 1.3M all-time leaderboard |
| Update/rollback | Check/update, dir replace, Git snapshots | Check/update, recovery, no rollback | New-options badges, no rollback | Read-only metadata |
| Agent detection | Path existence, custom paths | Declarative path specs + confidence | N/A | Lists supported agents |
| Cross-platform | Win/mac/Linux, junctions | Win/mac/Linux + WSL | Win/mac/Linux | Web |
| Security | Path guards, hashes, keyring | Preview/lease/path validation, client trust | Server validation, DOMPurify | Automated audits, no warranty |
| License | MIT | Apache-2.0 | MIT | Third-party content |

## Opportunities / differentiation for Universal AI Skills Manager

**Already solved:** `SKILL.md` parsing (use the spec); multi-agent path adapters, copy/symlink, custom tools; Git/local/archive/well-known ingestion; scopes; presets; preview-before-write; update checks; lock interop.

**Missing:**
1. **Desktop-usable catalog API.** skills.sh is Vercel-only and read-only; HTML scraping is fragile. Support pluggable catalogs: skills.sh (best-effort), GitHub search, well-known indexes, user JSON. Never make one catalog the architecture.
2. **Cross-source identity and versioning.** No standard for “same skill from two sources”, semver or lineage. Content hash + normalized source ID + declared version, with history, is a gap.
3. **Per-skill rollback.** Skills Manager snapshots the whole library; Skill Deck only repairs consistency; Hydra has none. Keep N versions and restore in one click.
4. **Source trust model.** Custom sources mean “trust this URL”. Add checksums/signatures, declared capabilities, audit imports and per-source permissions without a server.
5. **First-class custom entries.** Hydra’s lesson: if source entries only decorate an existing catalogue, most of the source disappears. Local skills and custom catalogs must be equal citizens.
6. **Unified search + update inbox** across installed, local and remote skills, with diffs and conflict handling.

**MVP boundary (Tauri 2 + React + Rust + SQLite):**
- **Sources:** Git URL, local folder, generic HTTPS JSON catalog (manifest v1: `id`, `name`, `type`, `url`, `trust`, `refresh`, `selector`), well-known index. No executable plugin runtime.
- **Schema:** `sources`, `skills`, `skill_versions`, `installs`, `agents`, `projects`, `presets`, `events`; unique `(content_hash, source_id)`.
- **Agents:** 6–8 built-ins (Claude Code, Codex, Cursor, Copilot, Gemini CLI, OpenCode) plus custom paths; declarative detection; preview before write.
- **Lifecycle:** install (copy/symlink), update with diff, uninstall, per-skill snapshot + rollback (last 5), adopt unmanaged skills.
- **Catalog:** skills.sh read-only via cached HTML or user export, labelled best-effort; never depend on its API.
- **Out of scope:** accounts, cloud sync, marketplace publishing, WSL, plugin sandbox, telemetry.

**Unverified:** Hydra’s full source JSON schema (client never parses it; inferred from #2833); whether skills.sh enforces per-IP or per-project limits; “50+ tools” is Skills Manager’s README claim; zero advisories ≠ zero vulnerabilities.
