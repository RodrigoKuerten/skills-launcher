# ECC Orchestration Log

This project was built with the real ECC installation present on this machine — not a simulated multi-agent system.

## Runtime assets used

| Asset | Location | Evidence |
| --- | --- | --- |
| ECC orchestrator (primary) | `C:\Users\rodri\.config\opencode\agents\ecc-orchestrator.md` | default agent in `~/.config/opencode/opencode.json` |
| ECC repository | `C:\Users\rodri\Documents\ecc` | 71 agents, 314 skills, 98 commands, OpenCode adapter |
| Orchestration command | `ecc/.opencode/commands/orchestrate.md` | three patterns: sequential, parallel, fan-out/fan-in |
| Agent registry | `ecc/agents/*.md` | `architect`, `code-reviewer`, `security-reviewer`, `database-reviewer`, `planner`, `doc-updater`, `tdd-guide`, `e2e-runner` |
| Skills used directly | `ecc/skills/...` | `plan-orchestrate`, `team-agent-orchestration`, `skill-host-compat`, `code-review-and-quality`, `security-and-hardening`, `typescript-patterns`, `react-patterns`, `mysql-patterns` (schema principles), `verification-loop` |
| Constraint honored | `experimental.subagent_depth = 1` | all fan-out issued by the orchestrator |

## Roles and real delegations

| Phase | Agent | Mode | Write scope / output |
| --- | --- | --- | --- |
| P0 | `architect` | background, read-only | Reviewed plan before code; exposed local-API CSRF, XSS, license, version/quarantine, compatibility and rate-limit risks; proposed module boundaries |
| P0 | `docs-lookup` | background, read-only | Verified host skill directories, required frontmatter, CLI names, GitHub endpoints, skills.sh auth and repository layouts with citations |
| P1 | Orchestrator | direct | Monorepo, Prisma schema, auth/http/db foundation, design tokens, seed, pages, APIs, admin, docs |
| P2a | `general` (domain core) | parallel writer | `packages/core/src` + 41 tests |
| P2b | `general` (sync) | parallel writer | `apps/web/lib/sync` + CLI + 13 tests |
| P2c | `general` (companion) | parallel writer | `apps/agent` + 10 tests |
| P3 | Orchestrator | direct | Catalog, detail, updates, library, sources, profile, My Agents, docs, admin UI, API routes; resolved writer integration issues |
| P4 | Orchestrator + TDD output | verification | Live seed, endpoint checks, ZIP/manifest checks, CLI install/update/rollback/remove against a temp project |
| P5 | `security-reviewer` | parallel read-only review | Auth, import, download, installer, SSRF, XSS |
| P5 | `typescript-reviewer` | parallel read-only review | Runtime correctness, transactions, paths |
| P5 | `react-reviewer` | parallel read-only review | Hydration, client boundaries, accessibility, responsive |
| P5 | `database-reviewer` | parallel read-only review | Schema, invariants, indexes, transactions |
| P5 | `code-reviewer` | parallel read-only review | Claims vs implementation, wiring, visual-only features |
| P6 | `e2e-runner` / orchestrator | browser verification | Real Chrome journeys on home, explore, detail, login, library, admin, My Agents, downloads |
| P7 | `doc-updater` | writer | README, API reference, codemaps consistency |

## Conflict avoidance

- Frozen files before fan-out: `packages/core/src/types.ts`, `hosts.ts`, `apps/web/prisma/schema.prisma`.
- Writers owned disjoint paths: core, sync, agent. No writer touched another writer's package.
- Orchestrator owned pages, API routes, schema, seed, auth. Reviewers were read-only.
- Duplicate work avoided by giving every writer the exact core exports and schema fields.

## Corrections made during integration

| Finding | Correction |
| --- | --- |
| Architect: companion API CSRF/token surface | Token required on every route including GET; Host checked; origin allowlist; no arbitrary paths from web; loopback bind |
| Architect: untrusted markdown XSS | `react-markdown` with raw HTML disabled, images disabled, links hardened, CSP/security headers |
| Architect: license/redistribution risk | Permissive SPDX allowlist; source-only fallback; NOTICE in every ZIP |
| Architect: version/quarantine state ambiguity | Immutable versions, per-version `status`, atomic pointer publish, download gate on published versions |
| Architect: GitHub budget | Tree-SHA short-circuit, raw delivery instead of contents API, per-run budget, capped skills |
| Research: OpenAI layout | Seed path corrected to `skills/.curated` |
| Seed failure: empty raw file 501 | Request `Accept-Encoding: identity`; per-file failures quarantine instead of failing the whole source |
| Seed noise: 900-item HF feed | Cap discoveries to 50 per feed and count created correctly |
| Browser: explore stuck skeleton | Removed route-level `loading.tsx`; filters made prop-driven instead of `useSearchParams` |
| Browser: duplicate install panels/IDs | One responsive `InstallPanel`; `order-first` on mobile |
| Env: secrets absent at runtime | Explicit env wrapper for Next (`scripts/with-env.mjs`) |
| Cron secret test | Unauthorized `401`, secret-authorized `200` after env fix |

## Review gate outcomes

Five read-only ECC reviewers ran in parallel on the working tree.

| Reviewer | Highest-severity findings | Resolution |
| --- | --- | --- |
| `security-reviewer` | HIGH: saved-library API leaked full version files past the license gate. MEDIUM: unbounded JSON/form bodies, spoofable XFF + synchronous scrypt, DNS-rebinding TOCTOU. LOW: manifest-slug substitution, cron session CSRF gap, default seed secrets, disabled-source jobs, backup permissions, feed URL leaks | Library API returns card fields only; streamed 1MB JSON cap + declared body cap; proxy-appended IP + hard bucket bound; async scrypt; manifest slug binding; same-origin cron sessions; production seed guards; disabled jobs skipped; 0700 backups; feed errors redacted; DNS resolved once and the connection pinned via undici Agent with redirects blocked |
| `typescript-reviewer` | Partial snapshots cached as complete; source edits ignored the tree cache; new sources hard-coded `main`; feed SSRF/timeout gaps; archived skills listed but 404 on manifest | `incomplete` flag + approval block + partial runs; cache invalidation on path/branch/trust change; empty branch falls back to `repo.default_branch`; DNS resolution, redirect rejection, 20–25s timeouts, 2MB feed cap; archived skills remain installable at their last snapshot |
| `react-reviewer` | Token dead-end; admin forms threw after await; mobile filter overflow; stale search values; mobile menu stayed open; panel order; toast semantics; contrast; theme flash; open redirect | Change-token recovery, captured form element, wrapping filters, keyed controls, client mobile menu, single natural-order panel + anchor CTA, alert-role errors, contrast tokens, dark default with correct pre-paint script, origin-checked redirect |
| `database-reviewer` | Rejected skills resurrected; repo pin overwritten; source delete cascaded user data; license/trust not per-version; publish TOCTOU/stale hosts; blob overfetch; weak indexes | Auto-publish guard, repo-id refusal, delete guard for user data, `SkillVersion.license/trustLevel`, transactional publish recheck + host rebuild, card/history selects without blobs, composite indexes and page cap |
| `code-reviewer` | Pagination never left page 1; install/update result contracts mismatched; source-only install offered; reporting unwired; CLI commands started the server; audit log/rollback unreachable; incomplete approvals | Fixed pagination builder, normalized result DTOs, source-only gating + default tab, end-to-end `SKILLS_HUB_API_TOKEN` reporting (install/update/remove/rollback), `agent:cli` entry point, audit page, admin restore action, incomplete badge + approval block |
| `e2e-runner` | Mobile overflow when paired; dev CSP eval noise | `minmax(0,1fr)` grids + `min-w-0`; dev-only `unsafe-eval` allowed |

The follow-up hardening pass closed the remaining runtime findings: background auto-update with explicit opt-in, pinned DNS connections for feed fetches, async scrypt, normalized `searchText`, a unique open-job key, and fixed transitive Prisma CLI pins (`npm audit` now reports zero). Remaining documented work is scale/deployment only: Postgres locking/`SKIP LOCKED`, cursor paging for very large repos, Redis, multi-region, payments and email/push.

## Verification evidence (real runs)

- `node node_modules/vitest/vitest.mjs run` → **7 files, 64 tests passed**.
- `npm run build` → **PASS** (all 48 routes compiled; requires dev server stopped on Windows because Prisma locks its query engine DLL during generate).
- `tsc --noEmit` for web and agent → **no errors**.
- Live seed → **114 active skills, 46 quarantined, 160 versions, 798 host validations**, 10 sources, 2 RSS feeds, 50 discoveries.
- Manifest/download → verified per-file SHA-256, `200` ZIP with `NOTICE.txt`, source-only returns `409`.
- CLI install → real install into a throwaway `.opencode/skills` project; update preserved a user file; rollback restored the backup; remove confirmed; no real agent directory touched.
- Account reporting → created a real API token, installed into a throwaway project with `SKILLS_HUB_API_TOKEN`, verified `Installation` row and `installCount=1`, then cleaned the test data and revoked the token.
- Browser → home, explore with query/filter/sort, detail (source-only + permissive), save, review (5.0/1), library, login, admin dashboard + all admin pages, sources, updates, docs, My Agents with real OpenCode detection; **zero console errors and zero horizontal overflow** on desktop, plus a prior 990px pass.
- Lighthouse → **100 accessibility / 100 best practices / 100 SEO** on home, explore and skill detail (after contrast/label fixes).
- E2E runner → independent PASS on catalog, filters, downloads, auth redirects, admin pages, My Agents detection and navigation; its two findings (paired mobile overflow, dev CSP eval) were fixed and re-verified.
- Cron endpoint → `401` without secret, `200` with `CRON_SECRET`.
- `npm run typecheck` → web, agent and core all pass.
- `npm run build` → PASS after stopping the dev server (Windows Prisma engine lock).
- `npm audit` → **0 vulnerabilities** after pinning the fixed Prisma CLI transitive versions.
- Companion auto-update setting → `GET/POST /api/settings` persisted `true/false` and started/stopped the loop.
- Tauri desktop → Windows release EXE compiled; **NSIS installer (24.99 MiB) built and installed silently**; the installed app spawned the Node SEA sidecar, `/api/health` returned 200, the tray/window loaded, and the Tauri origin passed CORS preflight.
- Node SEA sidecar → health 200 on a loopback test port; no external runtime needed.
- Feed SSRF test → pinned `undici` fetch completed with 200 and a real sync returned `OK` (50 unchanged discoveries).

## Known limitations (stated, not hidden)

- Windows Tauri shell built, installed and smoke-tested; macOS/Linux builds were not run here.
- No payments, email/push, Redis, or multi-region deployment (outside the requested MVP).
- Static scanning is heuristic; it can miss intent and produce false positives.
- Host paths verified from docs on 2026-11-09; only Windows was exercised on real hardware. macOS/Linux paths follow docs and are unit-tested indirectly.
- RSS/JSON feed items are discovery records only; an admin must register a repository source.
- The companion reports installs only when started with `SKILLS_HUB_API_TOKEN`; the count is labeled self-reported. Without it, installs stay local.
- Job dedupe now uses a unique `openKey` plus transactional enqueue; Postgres still needs `SKIP LOCKED` for multiple workers.
- Search uses the normalized `searchText` column; the remaining scale work is index/cursor paging.
- A capped sync (40–100 roots per run) does not advance a cursor through a very large repo; use the CLI for larger backfills.
- Background updates are opt-in and off by default; installed apps still need a reachable marketplace for manifests.

## Desktop pivot and design audit (2026-11-10)

The desktop pivot used the real ECC subagents available in this environment, coordinated from the main session:

| Phase | Real ECC agent / skill | Output |
| --- | --- | --- |
| Competitor/license research | `general` research agent | `docs/research/competitors.md` |
| Architecture review | `architect` | modular-monolith decision, security/install risks |
| Rust backend + SQLite/source/agent engines | Orchestrator | `src-tauri` modules, tests, real source sync |
| React UI implementation | `general` UI writer in a separate worktree | full screens, design system, typed IPC client |
| Backend security review | `security-reviewer` | P1/P2 report; source caps, SSRF, scanner, backup and install fixes |
| Visual/UX audit | `react-reviewer` + `frontend-ui-engineering` skill | prioritised design report; changes implemented in the main tree |
| Verification | Playwright over WebView2, Cargo, TypeScript, clippy, NSIS | 0 console errors, 8 Rust tests, 0 npm vulnerabilities, installer smoke test |

The design audit is evidence-led: real catalog data, real OpenCode detection, real install/uninstall, no mock rows. Baseline
screenshots are in `docs/audit/before`; the reviewed result is in `docs/audit` and `docs/AUDIT.md`.

Remaining unverified surfaces are stated in `docs/SECURITY.md`, `docs/AGENTS.md`, `docs/SOURCES.md` and `docs/AUDIT.md`:
Linux/macOS runtime validation, project-scope installs, form dirty-state protection, and UI import/export automation.
