# Architecture — AI Skills Hub

## Context

AI agent skills are distributed as folders with a `SKILL.md` plus supporting scripts/resources. There is no central registry that tracks versions, safety and host compatibility. This platform imports from verifiable sources (GitHub, RSS, official catalogs), normalizes them, scores them, and installs them locally through host-specific adapters.

## Decisions

See `docs/adr/`:
- ADR-001: Next.js full-stack + Prisma
- ADR-002: Database-backed async jobs
- ADR-003: Static security scanning + quarantine
- ADR-004: SQLite for MVP, Postgres-ready
- ADR-005: Local companion instead of native Tauri shell
- ADR-006: Immutable versions + content hashing
- ADR-007: Auth with DB sessions and scrypt
- ADR-008: License-aware distribution and honest compatibility

## Runtime topology

```
Browser ──HTTPS──> Next.js (SSR + API) ──> Prisma ──> SQLite/Postgres
   │                     │
   │                     └── sync worker (cron or CLI) ──> GitHub API / RSS / HTTP
   │
   └──HTTP 127.0.0.1:4780──> Local companion (Node) ──> host skill directories
                                   │
                                   └── marketplace API (download manifest + checksum)
```

- The web app never touches the user's filesystem. This is structural: browser sandbox.
- Installation is a privileged operation only the local companion performs.
- The companion can run without an account for detection and local installs, but install/update manifests require the marketplace to be reachable. It optionally reports installations to `/api/v1/installations` with a user API token; there is no offline catalog cache.

## Trust boundaries

1. **Source → importer:** untrusted. Responses size-capped, parsed as data, never executed.
2. **Importer → catalog:** scanned + scored + optionally quarantined.
3. **Catalog → user device:** checksum-verified, path-validated, backed up.
4. **Local companion API:** loopback only + bearer token + origin allowlist.

## Versioning

A version is a two-level hash: `perFile = sha256(utf8(path) + NUL + bytes)`, then `contentHash = sha256(concat(perFile digests in path order))`. Commit SHA and release tag are metadata, not identity. This catches uncommitted/retagged changes and works for sources without semver. `SkillVersion` rows are immutable; publishing is a pointer move (`Skill.currentVersionId`) so rollback is instant.

## Compatibility

Host definitions live in `packages/core/src/hosts.ts`. A skill is marked compatible with a host only when:
1. the `SKILL.md` parses and satisfies the host's required frontmatter fields;
2. every file path is portable (no symlinks, no absolute paths);
3. the host adapter declares a verified install directory for the current OS.

Otherwise we offer export/download only. No claimed compatibility without these checks.

## Scaling path

- SQLite → Postgres: Prisma provider switch + `SKIP LOCKED` job claim (query already isolated in `claimJob`).
- Cron → dedicated worker process/queue (BullMQ/SQS). Job records and dedupe keys are present; add a partial unique index or queue-native dedupe before running multiple workers.
- In-memory rate limiter → Redis/Upstash. Single function boundary (`apps/web/lib/http.ts`, `rateLimit`).
- Object storage for file snapshots instead of SQLite JSON when repos grow.
