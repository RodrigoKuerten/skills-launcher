# ADR-005: Local companion with a Tauri desktop shell

**Status:** accepted (Windows shell built; macOS/Linux not run here)

## Context
Auto-install requires local filesystem access, which browsers cannot provide. A native shell improves discovery and pairing, but privileged install logic must stay in one audited place. Rust and the MSVC build tools were installed to verify a real Windows build.

## Decision
Ship the companion core as a Node CLI plus a loopback HTTP service (`127.0.0.1:4780`). The web UI consumes that API. A Tauri 2 desktop shell (`apps/desktop`) wraps the companion as a bundled Node SEA sidecar and adds a tray icon, local status window and pairing-token display. All host adapters, detection, checksums, backups, rollback and journaling still live in `apps/agent`; the shell does not duplicate privileged logic. The shell reuses an already-running companion instead of starting a second server.

Security: bind loopback only; validate the `Host` header; require `X-Agent-Token` on every request; allow only configured browser origins (including the Tauri origin); no arbitrary paths from web callers; never execute imported content.

## Consequences
- Windows gets a real installer (`apps/desktop/src-tauri/target/release/bundle/nsis`).
- macOS/Linux builds use the same project and sidecar script; they were not executed in this environment.
- The desktop shell and the CLI share one API and one security model.
- Users can still run the companion without the shell via `npm run agent`.
