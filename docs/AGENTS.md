# Agents

Skills Launcher treats an agent as installed only when it finds runtime evidence. A config folder or a `skills/`
directory alone is never enough.

## Host matrix

| Host | Executable evidence | User skill root | Project root |
|---|---|---|---|
| Claude Code | `claude` | `~/.claude/skills` | `.claude/skills` |
| OpenAI Codex | `codex` | `~/.agents/skills` | `.agents/skills` |
| OpenCode | `opencode`, `opencode-cli`, OpenCode Desktop app | `~/.config/opencode/skills` | `.opencode/skills` |
| Cursor | `cursor` / `agent` or the installed app | `~/.cursor/skills` | `.cursor/skills` |
| GitHub Copilot | `copilot`, or VS Code with the Copilot extension | `~/.copilot/skills` | `.github/skills` |
| Gemini CLI | `gemini` | `~/.gemini/skills` | `.gemini/skills` |
| Windsurf | `windsurf` or the installed app | `~/.codeium/windsurf/skills` | `.windsurf/skills` |

The app probes versions with fixed arguments and a 3-second timeout. It never executes imported skill content.

## Detection rules

- `detected` requires an executable on `PATH`, a known application binary, or (for Copilot) VS Code plus the
  GitHub Copilot extension directory.
- An ambiguous/overlapping root is reported in `notes`; Codex installs go to `.agents/skills` when both roots exist.
- `skillsPath` is the documented root even when the agent is not detected. It is a destination hint, not detection.
- The UI should show evidence and paths, and never present a config-only directory as “detected”.

## Install lifecycle

1. Resolve the published immutable version from SQLite and re-verify its content hash.
2. Refuse `QUARANTINED` or `HIGH`/`CRITICAL` versions unless the request explicitly allows risky content.
3. Resolve the host root under the user's home. Reject symlinks, reparse points, path escapes and reserved names.
4. Create an installation record, then back up any existing managed folder into app data.
5. Stage files in a hidden sibling directory; preserve untracked user extras, remove old managed files.
6. Swap atomically, verify the DB pointer, and log the operation.
7. On failure, mark the installation `FAILED`; never leave a half-written target.

Update uses the same path. Rollback restores a selected backup after backing up the current tree. Uninstall backs up
before removing files and keeps the installation history row.

## Auto-update

The per-agent switch is stored as `agent_auto_install.<host>`. When auto-sync is enabled, a successful sync checks
installed skills for newer non-quarantined versions and updates only agents with the switch enabled. Manually triggered
updates are always available in Updates.

## Limits

- Windows is the fully validated runtime. Linux/macOS build and process launch are validated in CI, but their host
  descriptors and real agent installs have not been exercised on those operating systems; do not claim them verified.
- Project-scope installs are not in this slice; only user-level roots are written.
- No skill script, hook or install command is executed.
- Detection can miss agents that are running from an unregistered/portable binary or a desktop app with no PATH/known
  install path.
- No cloud/team sync.
