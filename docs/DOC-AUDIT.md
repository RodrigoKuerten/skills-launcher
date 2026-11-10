# Documentation audit — resolved

**Date:** 2026-11-09
**Scope:** README, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/adr/*`, in-app docs pages.

All material mismatches found in the first audit were corrected:

| Original mismatch | Resolution |
| --- | --- |
| Manifest status said `409` for no published version | `docs/API.md` now says `404` no published version; `409` license/hash conflicts |
| Rate limiter path `lib/rate-limit.ts` did not exist | `docs/ARCHITECTURE.md` points to `apps/web/lib/http.ts` |
| ADR list stopped at 007 | Added ADR-008 |
| Hash formula was not reproducible | Two-level formula documented in ARCHITECTURE, ADR-006 and `/docs/architecture` |
| Companion "local catalog cache" claim | Removed; manifests require the marketplace to be reachable |
| In-app docs referenced nonexistent OpenAPI descriptions | Replaced with `docs/API.md` |
| PLAN archive-after-two-misses and WARN tier claims | Updated to one complete pass and binary publish/quarantine |
| skills.sh "token-gated" claim | HTTP_JSON sync now reads an env-backed bearer token from source config; source remains disabled by default |
| Auto-update wording | Implemented as opt-in in My Agents; documented with `AUTO_UPDATE_INTERVAL_MS` and manual default |

Verified present: all 8 ADRs, README, PLAN, ARCHITECTURE, ORCHESTRATION, API, codemap, docs pages, `scripts/with-env.mjs`.

Verified state: `npm test` 7 files / 64 tests; `npm run typecheck` web/agent/core; `npm run build` PASS; `npm audit` 0; production smoke and Lighthouse 100/100/100 on the settled page; Windows Tauri installer built and installed; Node SEA sidecar health 200.
