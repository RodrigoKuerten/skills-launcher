# ADR-004: SQLite for the MVP, Postgres-ready

**Status:** accepted

## Context
Local development and a single-instance MVP need zero setup. The target architecture should scale to Postgres.

## Decision
Use SQLite with Prisma, storing JSON payloads as strings for cross-provider parity. Keep provider-specific SQL isolated to the job claim and pragma setup. Use WAL and a busy timeout. Document the switch to Postgres plus `SKIP LOCKED`.

## Consequences
- No database service required to run the project.
- SQLite is not appropriate for multi-writer horizontal scaling.
- File snapshots are stored as JSON in the DB for the MVP; large catalogs should move them to object storage.
