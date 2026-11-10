# ADR-007: Server-side sessions with scrypt passwords

**Status:** accepted

## Context
The MVP needs authentication for library, reviews, reports, admin and API token management without adding an identity provider.

## Decision
Hash passwords with scrypt (random 16-byte salt, 64-byte output). Store random 32-byte session tokens hashed with SHA-256 in the database; put the raw token in an HTTP-only, SameSite=Lax cookie. Mutations validate the Origin header against the Host. Admin routes require `role=ADMIN` server-side. Companion API tokens are separate, hashed, revocable and scoped to installation reporting.

## Consequences
- Sessions are revocable server-side.
- No email verification, password reset or MFA in the MVP; document before public launch.
- Rate limiting is in-memory and single-instance; replace with Redis when scaling.
