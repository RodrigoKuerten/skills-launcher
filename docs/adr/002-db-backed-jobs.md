# ADR-002: Database-backed async jobs

**Status:** accepted

## Context
Monitoring must run periodically and survive process restarts. The MVP should not require Redis or a separate queue service.

## Decision
Use a `Job` table with `PENDING/RUNNING/DONE/FAILED`, a dedupe key, attempts, and a claim implemented as a conditional `UPDATE ... WHERE status='PENDING'`. One worker processes jobs. Stale `RUNNING` locks are reaped after 30 minutes. SQLite runs in WAL mode with a busy timeout.

## Consequences
- No extra infrastructure for the MVP.
- The claim is atomic per statement; correctness depends on a single worker until the Postgres migration adds `SKIP LOCKED`. The dedupe key is checked before enqueue but is not a partial unique index yet; add one before running concurrent schedulers.
- Scheduler entrypoints: `/api/cron/sync` (secret or admin), `npm run sync -- --due`, and manual admin source sync.
