# Public API Reference

Base URL: `http://localhost:3000/api/v1`. All responses are JSON except the ZIP download. Mutable and gated responses use `Cache-Control: no-store`.

## Authentication

| Mode | Header / cookie | Used by |
| --- | --- | --- |
| Session | `ash_session` HTTP-only cookie | Web UI, library, reviews, reports, tokens |
| API token | `Authorization: Bearer sh_…` | Companion installation reports |
| Cron | `Authorization: Bearer $CRON_SECRET` | Sync scheduler |

Cookie-authenticated mutations also require a same-origin `Origin` header. Tokens are hashed at rest; the raw value is displayed once.

## Catalog

### `GET /skills`

Query: `q`, `category`, `host`, `trust`, `sort` (`quality|popular|updated|newest|rating|name`), `page`, `limit` (1–48).

```json
{ "data": [ { "slug": "...", "name": "...", "summary": "...", "license": "MIT", "hosts": [] } ],
  "meta": { "total": 114, "page": 1, "pages": 10, "limit": 12 } }
```

Only `ACTIVE` skills are listed. `popular` sorts by source stars, not self-reported installs.

### `GET /skills/:slug`

Returns skill metadata, category, source, host compatibility, current version (label, hash, commit, scan summary, README), published version history and recent reviews. Quarantined/rejected skills return `404` to the public.

### `GET /skills/:slug/manifest`

Companion-only install contract. Requires a published version and a permissive license.

```json
{
  "slug": "…",
  "name": "…",
  "versionLabel": "2026.11.09-a31f9c2",
  "contentHash": "sha256 of the canonical file set",
  "integrity": "sha256-manifest",
  "distribution": "FULL",
  "files": [{ "path": "SKILL.md", "encoding": "utf8", "content": "…", "sha256": "…" }],
  "compatibility": { "claude-code": "VERIFIED" },
  "instructions": "fixed installation text",
  "sourceUrl": "https://github.com/owner/repo/tree/<sha>/<path>"
}
```

`404` when there is no published/quarantined-excluded version; `409` for source-only licenses or a stored snapshot that no longer matches its hash.

### `GET /skills/:slug/download`

ZIP of the published, permissively licensed snapshot plus `NOTICE.txt` (attribution, version, hash, source, license). `409` when the license is missing or restrictive.

### `GET /categories`, `GET /sources`, `GET /updates?limit=`

Categories with active counts; monitored sources with last status/counts; recent published versions.

## Account

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| GET/POST | `/library` | session | List / toggle saved skill (`{ skillId }`) |
| POST | `/skills/:slug/reviews` | session | Upsert rating 1–5 and text |
| POST | `/skills/:slug/reports` | session | Report `unsafe|malware|broken|license|spam` |
| GET/POST | `/me/tokens` | session | List / create companion tokens |
| DELETE | `/me/tokens/:id` | session | Revoke |
| GET | `/installations` | session | Own reported installations |
| POST | `/installations` | bearer token | Report install/update/remove. Body: `machineId`, `skillSlug`, `host`, `versionLabel`, `contentHash`, `installedPath`, `status` |

## Admin API

All require an admin session and same-origin mutations. Every mutation writes `AuditLog`.

- `GET/POST /admin/sources`, `PATCH/DELETE /admin/sources/:id`, `POST /admin/sources/:id/sync`
- `GET /admin/review`
- `POST /admin/skills/:id` (approve latest quarantined version), `DELETE /admin/skills/:id`
- `POST /admin/versions/:id` (publish), `DELETE /admin/versions/:id` (reject)
- `GET /admin/reports`, `PATCH /admin/reports/:id`
- `GET /admin/discoveries`, `PATCH /admin/discoveries/:id`
- `GET /admin/metrics`, `GET /admin/runs`
- `POST /admin/categories`, `PATCH/DELETE /admin/categories/:id`

## Scheduler

`POST /api/cron/sync` with `Authorization: Bearer $CRON_SECRET` (or an admin session). Enqueues due sources into the DB-backed job queue and processes a bounded batch. Unauthorized requests return `401`.

## Errors

```json
{ "error": "human-readable message" }
```

`400` validation, `401` missing auth, `403` cross-origin/role, `404` not found or quarantined, `409` license/state conflict, `429` rate limit, `500` sanitized internal error.

## Rate limits

Fixed-window, in-memory, per IP (MVP): catalog/detail 120/min, manifest 60/min, download 30/min, login 10/5 min, register 5/10 min, reviews 10/hour/user. Swap the limiter for Redis before horizontal scaling.
