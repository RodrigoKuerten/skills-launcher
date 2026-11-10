# AI Skills Hub

A marketplace and update layer for AI agent skills. Discover skills from verifiable sources, inspect their provenance and scan findings, install them into Claude Code / Codex / OpenCode / Cursor / Windsurf / Copilot / Gemini CLI with a local companion, and keep them current.

> Automated scans are heuristics, not a security guarantee. Compatibility badges describe format validation; auto-install depends on local detection.

## What works

- **Marketplace**: home, explore with search/filter/sort/pagination, categories, skill detail, version history, reviews, reports, saved library, update feed, monitored sources, docs.
- **Live imports**: GitHub repositories (recursive tree + raw content) and RSS/Atom feeds. No invented data; failures are recorded.
- **Versioning**: immutable versions identified by a canonical SHA-256 file-set hash. Tree-SHA short-circuit avoids unnecessary work. Publishing is atomic; rollback is a pointer move.
- **Quality & safety**: deterministic static scanner (shell, prompt injection, secrets, obfuscation, unsafe paths), quality score, source trust separate from security, per-version quarantine, admin approval.
- **Host compatibility**: Agent Skills validation for seven hosts, with the researched user/project directories. No auto-install claim without detection.
- **Downloads**: ZIP export only for permissive licenses, with a generated NOTICE; otherwise source-only links.
- **Auth**: scrypt passwords, DB-backed HTTP-only sessions, role-guarded admin, CSRF origin checks, rate limits.
- **Admin**: source management + sync, quarantine queue, version approvals, reports, sync runs, discoveries, categories, metrics, audit log.
- **Local companion**: real detection, install/update/remove/rollback, checksum and path validation, backups, journal, loopback API with per-machine token on every request, CLI, optional configurable background updates, and a Tauri desktop shell with tray and local status window.
- **Async**: DB-backed jobs, unique open-job dedupe, atomic claim, retries/backoff, stale lock reaper.
- **API**: public v1 endpoints documented at `/docs/api` and in `docs/API.md`.

## Stack

Next.js 16 · React 19 · TypeScript strict · Tailwind CSS 4 · Prisma 6 · SQLite (Postgres-ready) · Node 24 · Vitest · lucide-react · fflate · react-markdown · Tauri 2 desktop shell (Rust + Node SEA sidecar).

## Quickstart

```bash
npm install
npm run db:push
npm run db:seed      # registers real sources and imports live skills
npm run dev          # http://localhost:3000
```

Seed credentials (development defaults, override in `.env`):

- Admin: `admin@skills.hub` / `skills-hub-admin`
- Demo: `demo@skills.hub` / `skills-hub-demo`

Start the local companion in another terminal:

```bash
npm run agent
# prints http://127.0.0.1:4780 and a pairing token
```

Open **My Agents**, paste the token, detect hosts, then install from a skill page whose license permits mirroring. Source-only skills link back to their original repository instead.

To sync installations to your account, create a token in **Profile** and start the companion with it:

```powershell
$env:SKILLS_HUB_API_TOKEN="sh_..."
npm run agent
```

Without that token, installs stay local and the library's "reported installations" remains empty by design.

Background updates are opt-in in **My Agents**. When enabled, the companion checks periodically
(`AUTO_UPDATE_INTERVAL_MS`, default 6 hours), installs only licensed manifests with checksum verification and a
backup first, and journals every result.

### Desktop companion (Tauri)

A Windows desktop shell is built at `apps/desktop`: tray icon, local status window, pairing token, agent detection and
a sidecar Node single-executable application (SEA) that starts the companion. It reuses an already-running companion.

```bash
npm run build:desktop        # sidecar + Tauri build; installer under apps/desktop/src-tauri/target/release/bundle
npm run dev:desktop          # Tauri dev shell
```

The Rust/Tauri build needs Rust and the MSVC C++ build tools installed. macOS/Linux builds use the same sidecar script
with the local Node binary; only Windows was compiled and run here.

### Environment

Copy `.env.example` to `.env`. A `GITHUB_TOKEN` is optional but raises the GitHub API limit from 60 to 5,000 requests/hour.

## Commands

```bash
npm run dev            # web app
npm run build          # prisma generate + next build
npm test               # core + sync + installer tests
npm run db:push        # apply schema
npm run db:seed        # idempotent seed + live sync
npm run sync -- --due  # process due sources
npm run sync -- --source <id-or-slug>
npm run agent          # local companion server
npm run agent:cli -- detect --json
npm run agent:cli -- install <slug> --host opencode
npm run agent:cli -- updates
```

## Repository layout

```
apps/web/              Next.js app, API routes, sync engine, Prisma schema + seed
apps/agent/            local companion: detection, installer, CLI, loopback API
packages/core/         parser, security scanner, scoring, hashing, host registry
docs/                  plan, architecture, ADRs, API reference, orchestration log
```

## Security model

1. Imported content is untrusted data. It is never executed and never rendered as raw HTML.
2. Only a published, non-quarantined version can produce a manifest or download.
3. Mirrored bytes are only offered when the license is on a permissive allowlist.
4. The companion verifies every file hash and the canonical set hash before writing.
5. Paths are allowlisted; traversal and absolute paths are rejected; extra local files survive updates.
6. Backups precede replacement; rollback and remove are journaled.
7. The companion API is loopback-only, `Host`-checked, origin-allowlisted and token-gated on every route.
8. Checksums prove integrity, not authenticity: bytes and hashes come from the same server.

## Deliberate MVP limits

- The Tauri desktop shell is built for Windows (tray + local status window + bundled Node SEA sidecar). macOS/Linux builds are supported by the same project but were not run here.
- No payments. Schema fields and UI labels are prepared; checkout is not implemented.
- No email/push notifications; update signals are in-app. Background updates are opt-in and configurable; off by default.
- No scraping of sources that require auth or prohibit it. skills.sh is registered as a disabled, token-gated source.
- Rate limiting and the job claim are single-instance; see `docs/adr/004-sqlite-postgres-ready.md` and `docs/adr/002-db-backed-jobs.md` for the scaling path.
- Skills are byte-hashed exactly; line-ending changes create new versions by design.
- Discovery is scoped to monitored repositories and feeds; there is no global GitHub crawler.
- Search uses a normalized `searchText` column (accent/case normalized), so it behaves consistently across SQLite and Postgres.
- Feeds are admin-added, HTTPS-only, DNS-resolved once and the connection pinned to that address; redirects are blocked.
- The Prisma CLI transitive advisories are pinned to fixed versions; `npm audit` reports zero vulnerabilities.


## Documentation

- `docs/PLAN.md` — orchestration plan and progress
- `docs/ARCHITECTURE.md` — runtime topology and trust boundaries
- `docs/adr/` — eight architecture decisions
- `docs/ORCHESTRATION.md` — real ECC agents used and review gates
- `/docs/api` — API reference

## License

Application code: MIT. Imported skills retain their original licenses and attribution; see each skill's source and the generated NOTICE in downloads.
