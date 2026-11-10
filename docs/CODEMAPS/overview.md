# Repo overview codemap

**Last updated:** 2026-11-09
**Entry points:** `apps/web/app/layout.tsx`, `apps/web/app/page.tsx`, `apps/web/app/api/**/route.ts`, `apps/agent/src/server.ts`, `apps/agent/src/cli.ts`, `packages/core/src/index.ts`, `apps/web/prisma/seed.ts`

## Topology

```
Browser ──HTTPS──> apps/web (Next.js 16 SSR + route handlers) ──Prisma──> SQLite (apps/web/prisma/dev.db)
   │                     │
   │                     └── lib/sync (cron/CLI/admin) ──> GitHub API + raw / RSS / HTTP_JSON
   │
   └──HTTP 127.0.0.1:4780──> apps/agent (Node companion) ──> detected host skill dirs
                                   └── GET manifest + POST installation report ──> apps/web/api/v1
```

The web app never writes user files; only the companion does.

## Modules

| Path | Purpose | Key exports / routes |
| --- | --- | --- |
| `apps/web/app/` | Public pages: `/`, `/explore`, `/categories`, `/skills/[slug]`, `/library`, `/updates`, `/sources`, `/my-agents`, `/profile`, `/login`, `/register` | React Server Components; `robots.ts`, `sitemap.ts` |
| `apps/web/app/admin/` | Admin UI: `/admin`, `/admin/sources`, `/admin/review`, `/admin/runs`, `/admin/reports`, `/admin/discoveries`, `/admin/categories`, `/admin/audit` | `layout.tsx` gate via `requireAdmin()` |
| `apps/web/app/api/v1/` | Public JSON API: `skills`, `skills/[slug]`, `.../manifest`, `.../download`, `.../reviews`, `.../reports`, `categories`, `sources`, `updates`, `library`, `installations`, `me/tokens`, `me/tokens/[id]` | Catalog, account, manifest/download |
| `apps/web/app/api/admin/` | Admin API: `sources` (+`[id]`, `[id]/sync`), `skills/[id]`, `versions/[id]`, `review`, `reports` (+`[id]`), `discoveries` (+`[id]`), `runs`, `metrics`, `categories` (+`[id]`) | Admin session + same-origin + `AuditLog` |
| `apps/web/app/api/auth/` | `login`, `logout`, `register` | scrypt + DB session cookie |
| `apps/web/app/api/cron/sync/` | Scheduler | `CRON_SECRET` or admin session |
| `apps/web/lib/` | `db.ts`, `auth.ts`, `password.ts`, `http.ts`, `admin.ts`, `catalog.ts`, `manifest.ts`, `publish.ts`, `source-input.ts`, `utils.ts` | Prisma, auth, rate limit, catalog queries, publish transaction |
| `apps/web/lib/sync/` | `engine.ts` (source sync + job queue), `github.ts` (API/raw), `select.ts` (pick files/auto-publish rules) | `syncSource`, `enqueueDueSources`, `claimJob`, `processJobs`, `runDueSources`, `syncAllEnabled` |
| `packages/core/src/` | Pure domain logic used by web + agent | `parser.ts`, `security.ts` (`SCANNER_VERSION`), `scoring.ts`, `version.ts` (hashes/labels/paths), `hosts.ts` (7 hosts + license allowlist), `compat.ts`, `types.ts` |
| `apps/agent/src/` | Local companion | `server.ts` (HTTP routes + settings), `installer.ts`, `detect.ts`, `adapters.ts`, `store.ts`, `report.ts`, `autoupdate.ts`, `cli.ts`, `desktop-entry.ts` |
| `apps/desktop/` | Tauri 2 desktop shell | Rust tray/window + `skills-hub-agent` SEA sidecar; static `ui/index.html` |
| `apps/web/prisma/` | `schema.prisma` (16 models), `seed.ts` (12 categories, live sources) | `db:push`, `db:seed` |
| `docs/` | `PLAN.md`, `ARCHITECTURE.md`, `API.md`, `ORCHESTRATION.md`, `adr/001`–`008` | Human docs |
| `apps/web/app/docs/` | In-app docs: `/docs`, `/docs/api`, `/docs/agents`, `/docs/architecture` | Static pages + `layout.tsx` |

## Companion HTTP routes

`GET /api/health`, `GET /api/agents`, `POST /api/detect`, `GET /api/installed`, `GET /api/updates`, `POST /api/install`, `POST /api/update`, `POST /api/rollback`, `POST /api/remove` (`apps/agent/src/server.ts:192-323`). Every request requires `X-Agent-Token`.

## Request flow

1. **Import** — `scripts/sync.ts`/seed/admin sync → `enqueueDueSources` → `claimJob` → `syncSource` (`lib/sync/engine.ts`). GitHub: repo id check → recursive tree → `extractSkillRoots`/`selectSkillFiles` → raw files → `parseSkillMarkdown`, `scanSkillFiles`, `qualityScore`, `validateAllHosts`, `hashSkillFiles` → `SkillVersion` row `QUARANTINED`.
2. **Publish** — `shouldAutoPublish` allows OFFICIAL at quality ≥60, VERIFIED at ≥75 with no MEDIUM+ findings; COMMUNITY always waits. `publishVersion` (`lib/sync/engine.ts`, `lib/publish.ts`) transactionally sets `status=PUBLISHED`, moves `Skill.currentVersionId`, rebuilds `SkillHost`; the admin path also writes `AuditLog`. Admin: `POST /api/admin/versions/[id]` or `POST /api/admin/skills/[id]`.
3. **Manifest** — `GET /api/v1/skills/[slug]/manifest` → `getPublishedSkill` → permissive-license allowlist (`packages/core/src/hosts.ts`) → `verifyStoredHash` → JSON `{contentHash, files[].sha256, instructions}`.
4. **Install** — web install panel/My Agents → companion `POST /api/install` → `fetchManifest` → `verifyManifest` (slug, paths, size caps, per-file SHA-256, set hash) → `resolveInstallRoot` → backup → write temp → atomic swap → `state.json` + journal → optional report. `projectDir` is rejected over HTTP; CLI accepts `--project`.
5. **Report** — `report.ts` → `POST /api/v1/installations` with `Authorization: Bearer sh_…` → upsert `Installation`; first install increments `Skill.installCount`. `/library` and `/updates` read these rows.

## Trust boundaries

1. **Source → importer:** untrusted. HTTPS feeds, DNS private-address guard, no redirects, body caps, no execution.
2. **Importer → catalog:** static scan + quality + host-format validation; COMMUNITY and any HIGH/CRITICAL version stays quarantined.
3. **Catalog → device:** published version only, license allowlist, per-file + set hash verification, path allowlist, backup, atomic swap.
4. **Browser → companion:** loopback bind, `Host` allowlist, origin allowlist, `X-Agent-Token` on every route, no arbitrary paths/project dirs from HTTP.
5. **Web auth:** HTTP-only `ash_session`, SHA-256 token hashes at rest, same-origin mutations, role-guarded admin, in-memory per-key rate limits.

## Docs map

`docs/PLAN.md` (scope/progress), `docs/ARCHITECTURE.md` (topology), `docs/API.md` (public API), `docs/adr/` (8 decisions), `docs/ORCHESTRATION.md` (agent log and gates), in-app `/docs/*`.
