# AI Skills Hub — Execution Plan

**Owner:** ECC Orchestrator (session primary agent)
**Orchestration assets (real, installed):**
- `C:\Users\rodri\.config\opencode\agents\ecc-orchestrator.md` (primary orchestrator)
- ECC repo `C:\Users\rodri\Documents\ecc`: 71 agents, 314 skills, 98 commands, OpenCode adapter
- Subagents used: `architect`, `planner`, `general`, `docs-lookup`, `database-reviewer`, `security-reviewer`, `typescript-reviewer`, `react-reviewer`, `code-reviewer`, `tdd-guide`, `e2e-runner`, `doc-updater`, `build-error-resolver`, `devops-engineer`
- Constraint: `experimental.subagent_depth = 1` — all fan-out happens from the orchestrator.
- Conflict rule: every writing subagent owns disjoint paths; reviews are read-only and parallel.

## 1. Goal (MVP)

A production-shaped marketplace for AI agent skills: discover, inspect, score, export, install locally, and keep updated from verifiable sources. Web app + API + sync worker + local companion with real host adapters.

## 2. Explicit scope cuts (documented, not silently dropped)

| Deferred | Why | Hook left in place |
| --- | --- | --- |
| Tauri macOS/Linux builds | Rust/MSVC installed and Windows shell built + smoke-tested; no macOS/Linux runners here | `apps/desktop` is cross-platform; sidecar script emits the target triple |
| Payments | No provider keys; original request only asked to prepare | `priceCents`, `currency`, paid UI labels |
| Email / push | No mail provider; notifications are in-app only | `LibraryItem` + `/updates` |
| Redis queue | MVP runs one process; Postgres/Redis upgrade documented | DB-backed `Job` with unique open key + atomic claim; `docs/adr/004-sqlite-postgres-ready.md` |
| Multi-region / CDN | Out of MVP | architecture notes |

## 3. Architecture

```
apps/web (Next.js 16, React 19, Tailwind v4)
  app/(site)        public marketplace pages + skill detail + updates + library + my agents
  app/admin         sources, review queue, reports, metrics
  app/api/v1        public JSON API (catalog, download, compatibility, library, reviews, reports)
  app/api/agent     endpoints consumed by the local companion (manifest + checksum)
  lib/db.ts         Prisma client (SQLite dev, Postgres-ready schema)
  lib/auth.ts       scrypt password hashing, DB sessions, role guards
  lib/sync          source adapters + sync engine + queue worker (shared with CLI)
  lib/analysis      security scanner, quality score, compatibility validation
packages/core       pure domain logic shared by web + agent (parser, scan, score, versioning, host registry)
apps/agent          local companion: host detection, install/update/rollback, CLI + 127.0.0.1 HTTP API
prisma              schema + seed
docs                ADRs, API reference, orchestration log
```

## 4. Data model (Prisma)

`User, Session, ApiToken, Category, Source, Skill, SkillVersion, SkillCompatibility, Installation, LibraryItem, Review, Report, AuditLog, SyncRun, Job, Discovery`

Key invariants:
- One `Skill` per `(sourceId, sourcePath)`; dedupe by canonical repo + path.
- Immutable `SkillVersion` keyed `(skillId, contentHash)`; history preserved. `Skill.currentVersionId` points to the **published** version.
- New version scanners: clean + eligible official/verified source → auto-publish; anything else (community, HIGH/CRITICAL finding, incomplete snapshot, parse failure) → `QUARANTINED` pending admin approval. There is no WARN/reduced-trust publish tier.
- Popularity, quality and security are separate fields and separate UI signals.
- Every imported fact keeps `sourceUrl`, `commitSha`, `fetchedAt`.

## 5. Sync pipeline

1. `Source` row (GITHUB_REPO / RSS / HTTP_JSON), interval + trust tier.
2. Scheduler enqueues `Job(type=SYNC_SOURCE, dedupeKey=sourceId)`; worker claims atomically.
3. GitHub adapter: tree API (recursive) → locate `SKILL.md` files → fetch blobs (cap size) → parse → hash canonical file set → compare current hash / commit / tree hash.
4. RSS/HTTP adapter: ETag/Last-Modified conditional fetch; new items become `Discovery` for admin approval (never auto-imported).
5. Change detected → new `SkillVersion` + scan + compatibility validation → publish/quarantine.
6. Removed skills → `status=ARCHIVED` after a complete pass confirms the path is missing; repo-level archival also sets `archived`; source metadata (stars/forks/archived/pushedAt) refreshed.
7. Every run writes `SyncRun` (counts, error) and updates `Source.lastCheckedAt/lastStatus`.

No invented data: seed and sync fetch live from GitHub; skipped network results are recorded as errors, not faked.

## 6. Security model

- Imported content is untrusted data. Never executed, never `eval`, never templated into shell.
- Static scanner: dangerous shell patterns, download-and-pipe, encoded payloads, prompt-injection phrases, secret material, bidi/zero-width chars, oversized files, executable files, symlink-like paths.
- Quarantine on HIGH/CRITICAL; no download endpoint for quarantined versions.
- Installer validates checksum, path allowlist, refuses absolute/`..` paths, backs up before replace, never touches personal config files, logs every operation.
- Local companion: binds `127.0.0.1`, requires per-machine bearer token, CORS allowlist, no automatic updates without user setting, confirmation required for file writes.

## 7. Work breakdown & agent assignments

| Phase | Deliverable | Owner | Write scope |
| --- | --- | --- | --- |
| P0 | Plan, ADRs, host research | Orchestrator + `architect` + `docs-lookup` | `docs/` |
| P1 | Scaffold, Prisma schema, seed clients, design tokens | Orchestrator | root, `prisma/`, `app/layout`, `lib/db` |
| P2a | Domain core: parser, scanner, scoring, versioning | `general` writer | `packages/core/src`, `packages/core/tests` |
| P2b | Sync engine + GitHub/RSS adapters + worker | `general` writer | `apps/web/lib/sync`, `apps/web/scripts` |
| P2c | Local companion + adapters + CLI API | `general` writer | `apps/agent` |
| P3 | Catalog pages, skill detail, library, updates, admin | Orchestrator | `apps/web/app`, `apps/web/components` |
| P3b | Public API routes | Orchestrator | `apps/web/app/api` |
| P4 | Tests (unit + smoke), seed live catalog | `tdd-guide` + Orchestrator | tests only / seed |
| P5 | Review gate | `typescript-reviewer`, `react-reviewer`, `security-reviewer`, `database-reviewer`, `code-reviewer` (parallel) | none |
| P6 | Build, run, browser verification | Orchestrator + `e2e-runner` | none |
| P7 | Docs, API reference, final report | `doc-updater` | `docs/` |

## 8. Acceptance checks (must be real)

- `npm run build` exits 0.
- `npm test` runs domain + installer tests, all pass.
- Live seed imports real skills from at least 3 official sources with source URLs and commit SHAs.
- Search/filter/sort return correct DB-backed results; download ZIP matches stored version hash.
- Sync detects a changed file → creates a new version; unchanged run is a no-op (unit-tested with fixtures).
- Installer detects at least OpenCode on this machine (if executable/config present), installs into an allowed temp skills dir in tests, verifies checksum, backs up, rolls back.
- Quarantined skill cannot be downloaded.
- Admin login required for mutations; CSRF origin check on POST/PATCH/DELETE.
- Browser check of home, explore, detail, admin, my agents.

## 9. Progress log

- [x] Environment discovery: ECC install located; real agents/skills/commands confirmed; network + toolchain probed.
- [x] Live source verification (GitHub API): anthropics/skills, openai/skills, microsoft/skills, huggingface/skills, vercel-labs/agent-skills, obra/superpowers, affaan-m/ECC, agentskills/agentskills.
- [x] P1 scaffold (monorepo, Prisma schema, auth/HTTP foundation, design system)
- [x] P2 implementation (parallel writers: core, sync, companion)
- [x] P3 UI/API (catalog, detail, library, updates, sources, My Agents, admin, docs)
- [x] P4 tests (64 unit tests) + live seed (114 active / 46 quarantined) + installer E2E
- [x] P5 reviews (security, TypeScript, React, database, cross-cutting) and fixes
- [x] P6 verification (build, tests, browser, Lighthouse, cron, installer, reporting)
- [x] P7 docs (README, ADRs, API, orchestration log, codemaps)
- [x] P8 hardening follow-up: async scrypt, normalized search, unique job key, pinned DNS fetch, zero audit findings
- [x] P9 desktop + auto-update: Tauri 2 shell, Node SEA sidecar, Windows installer, opt-in background updates

### Review-driven fixes (final state)

- Per-version license/trust pinning; license gate reads the published version.
- `incomplete` snapshot flag blocks approval and prevents tree-SHA caching.
- Source path/branch/trust edits invalidate `lastTreeSha`; numeric repo identity is checked.
- Host compatibility rows rebuilt on publish; admin publish rechecks rejection inside the transaction.
- Rejected skills cannot be resurrected by auto-publish.
- Source delete refuses to cascade user-generated data.
- Install reporting wired end-to-end (`SKILLS_HUB_API_TOKEN`); update/remove/rollback report too.
- Explore pagination fixed; install/update result contracts normalized; source-only installs gated.
- Duplicate install panel removed; mobile overflow fixed (`minmax(0,1fr)` grids).
- CSP added with dev-only `unsafe-eval`; accessibility 100/100/100 on home/explore/detail.
- CLI entry points split (`npm run agent` server, `npm run agent:cli -- …`).
- Audit log page and admin restore action added; incomplete versions cannot be approved.
