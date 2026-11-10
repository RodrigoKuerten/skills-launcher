# ADR-001: Next.js full-stack + Prisma

**Status:** accepted

## Context
The MVP needs a marketplace UI, authenticated APIs, admin controls, downloads and a sync worker. One deployable unit reduces operational overhead while the product is validated.

## Decision
Use Next.js 16 (App Router, React 19) for SSR pages and route handlers. Use Prisma 6 as the data layer. Keep pure domain logic in `packages/core` so the future native desktop shell and other clients can reuse it.

## Consequences
- One runtime and one deploy for the web MVP.
- Long-running sync runs in a separate CLI/cron invocation, not in a request thread, except for explicit admin-triggered runs.
- The local companion is a separate Node package and never imports the web app or Prisma.
