# @skills-hub/agent — local companion

Node 24 CLI + loopback HTTP service that detects local AI agents and installs
Agent Skills (`SKILL.md` folders) into their documented skill directories.

It never executes skill content. It verifies file hashes, writes through a temp
directory and atomic rename, and keeps a backup before replacing anything.

## Quick start

From the repository root:

```bash
npm install
npm run agent:detect          # human-readable detection for all 7 hosts
npm run agent                 # start the HTTP service on 127.0.0.1:4780
```

Or from `apps/agent`:

```bash
node --import tsx src/cli.ts detect --json
node --import tsx src/cli.ts pair
node --import tsx src/cli.ts serve
```

`serve` prints the URL and a per-machine pairing token. The token is also stored
at `~/.skills-hub/agent.token` (`SKILLS_HUB_HOME` overrides the directory).

## Commands

```
skills-hub detect [--json]
skills-hub serve
skills-hub pair
skills-hub install <slug> --host <id> [--yes] [--app URL]
skills-hub install <slug> --all [--yes] [--app URL]
skills-hub list
skills-hub updates [--app URL]
skills-hub update <slug> [--yes] [--app URL]
skills-hub update --all [--yes] [--app URL]
skills-hub rollback <slug> --host <id> [--yes]
skills-hub remove <slug> --host <id> [--yes]
```

Writes require an interactive confirmation unless `--yes` is passed. Exit code
is `0` on success and `1` on failure or cancellation.

`--host` accepts: `claude-code`, `codex`, `opencode`, `cursor`, `windsurf`,
`copilot`, `gemini-cli`.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `4780` | Loopback HTTP port |
| `SKILLS_HUB_HOME` | `~/.skills-hub` | State, token and backups (tests use a temp dir) |
| `MARKETPLACE_URL` | `http://localhost:3000` | Manifest source for CLI/API installs |
| `AGENT_ALLOWED_ORIGINS` | `http://localhost:3000` | Comma-separated CORS allowlist |
| `ALLOW_REMOTE_MARKETPLACE` | unset | `1` allows HTTPS manifest URLs |

## HTTP API

Bind: `127.0.0.1` only. Every request, including `GET`, needs
`X-Agent-Token: <token>`. `Host` must be `127.0.0.1:<port>` or
`localhost:<port>`. Browser preflights (`OPTIONS`) are answered without the
token, because preflight requests cannot carry custom headers.

```
GET  /api/health
GET  /api/agents
POST /api/detect
GET  /api/installed
POST /api/install      { slug, hosts?, appUrl? }
POST /api/update       { slug?, all?, appUrl? }
POST /api/rollback     { slug, host }
POST /api/remove       { slug, host }
GET  /api/updates?appUrl=
```

Bodies are JSON, capped at 1 MB. The web API never accepts filesystem paths:
`projectDir` is rejected; installs use detected hosts and documented roots.
**Project installs** are available only through the library API with an explicit
absolute `projectDir` that already exists (`resolveInstallRoot`); the root must
stay inside the real path of that project.

## Detection rules

- A host counts as detected when its executable is found on `PATH`
  (`PATHEXT` on Windows, no shell, no `where`) or a known desktop app bundle
  exists (Cursor/Windsurf/Claude/OpenCode). A config or skills directory alone is
  **not** detection.
- Versions come from `<exe> versionArgs` with a 2-second `execFile` timeout and
  the first semver-looking token. Windows `.cmd` shims cannot be spawned without
  a shell, so the host is still detected but the version stays unknown.
- UNC/network paths are rejected for executables and install roots.
- All seven hosts are always returned; `skillsPath` is populated only when the
  host is detected.

## Install safety

- Manifest requires slug `^[a-z0-9][a-z0-9-]{0,79}$`, unique portable relative
  paths, `distribution: "FULL"`, `integrity: "sha256-manifest"`, and at most
  80 files / 4 MB total / 512 KB per file.
- Every file is decoded and hashed; the canonical set hash must equal
  `manifest.contentHash` (core `hashSkillFiles`).
- Install path is `<root>/<slug>`. Existing installs are copied to
  `~/.skills-hub/backups/<host>/<slug>-<timestamp>` first. Files are written to
  a fresh temp directory and swapped in with `rename`; on Windows the old
  directory is removed after the backup and restored if the rename fails.
- Unknown user files inside an existing skill directory are preserved on update.
  Central state remembers which files the manifest owns, so files removed from
  a new version are deleted while user extras survive.
- `remove` and `rollback` use the same backup/atomic path. Backups are never
  deleted automatically.
- Only documented user skill roots, explicit project roots and the companion
  home are written. Symlinked skill directories are rejected; symlinks inside
  an existing skill are never followed.

## Account sync (optional)

Create an API token in the marketplace profile, then start the companion with
`SKILLS_HUB_API_TOKEN=sh_...`. After a successful install/update/remove/rollback,
the companion POSTs the installation to `/api/v1/installations`. Reporting is
best-effort and never blocks a local install. Without the token, all data stays local.

## Security model

- **Loopback + token:** binds `127.0.0.1`, validates the `Host` header against
  DNS rebinding, and requires a 32-byte random token for every call.
- **CORS:** only the configured origins receive CORS headers; all requests carry
  `Vary: Origin`. State-changing calls are `POST` plus a custom header, so a
  browser must preflight them.
- **No execution:** skill files are data. The companion never runs `SKILL.md`,
  scripts or hooks, and never imports skill code. Detection executes only
  installed host binaries found on `PATH` or in known app locations.
- **No arbitrary paths:** the API accepts slugs and host ids, not paths.
  File writes are confined to resolved install roots.
- **Checksums are integrity, not authenticity:** verifying `sha256` proves the
  bytes match the manifest. It does not prove who published the manifest. Trust
  comes from the marketplace URL, HTTPS (when enabled) and the marketplace's
  review/scoring pipeline.
- **Local state is trusted:** `state.json` records install paths and backups.
  Anyone who can write your home directory can already modify your agents, so
  the companion does not re-authenticate local state.

## State layout

```
~/.skills-hub/
  state.json        # machineId, autoUpdate, installations, backups, managed file lists
  agent.token       # pairing token (mode 0600 where supported)
  operations.jsonl  # append-only operation journal (no token contents)
  backups/<host>/<slug>-<timestamp>/
```

## Tests

From the repository root:

```bash
node node_modules/vitest/vitest.mjs run apps/agent/tests
```

Tests use `SKILLS_HUB_HOME` and an explicit `rootOverride` under the OS temp
directory. They never touch the real home directory or real agent skill dirs.
