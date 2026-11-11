# Agents

Skills Launcher treats an agent as installed only when it finds runtime evidence. A config folder or a `skills/`
directory alone is never enough.

## Host matrix

| Host | Executable evidence | User skill root | Project root |
|---|---|---|---|
| Claude Code | `claude` | `~/.claude/skills` | `.claude/skills` |
| OpenAI Codex | `codex` | `~/.agents/skills` | `.agents/skills` |
| OpenCode | `opencode`, `opencode-cli`, OpenCode Desktop app | `~/.config/opencode/skills` | `.opencode/skills` |
| Cursor | `cursor-agent` / `cursor`, or the installed app | `~/.cursor/skills` | `.cursor/skills` |
| GitHub Copilot | `copilot` CLI (version must identify GitHub Copilot), or VS Code with the Copilot extension | `~/.copilot/skills` | `.github/skills` |
| Gemini CLI | `gemini` | `~/.gemini/skills` | `.gemini/skills` |
| Windsurf / Devin Desktop | `devin-desktop` / `windsurf`, or the installed app | `~/.codeium/windsurf/skills` | `.windsurf/skills` |

The app probes versions with fixed arguments and a 3-second timeout. It never executes imported skill content.

## Detection rules

- `detected` requires an executable on `PATH`, a known application binary, the official GitHub Copilot CLI version
  string, or (for Copilot) VS Code plus the GitHub Copilot extension directory.
- An ambiguous/overlapping root is reported in `notes`; Codex installs go to `.agents/skills` when both roots exist.
- `skillsPath` is the documented root even when the agent is not detected. It is a destination hint, not detection.
- The UI should show evidence and paths, and never present a config-only directory as “detected”.

## Existing skills on disk

Skills Launcher also imports skills that were already installed before the app. On startup, when **My Agents** loads, or
when **Library → Scan installed** is clicked, the app reads every documented user skill root (even when the agent
executable is not detected). Existing folders become Library entries with `origin=imported` and the **Found on disk**
badge.

- Only documented user roots are scanned; project-scope roots are not.
- Regular folders are read in place. Top-level symlinks/junctions are followed only when the resolved target stays inside
  the user's home directory; nested links are not followed.
- Importing a skill never executes its content and never marks the agent as detected. Detection still requires runtime
  evidence.
- Imported entries are read-only in Library: no update, rollback, uninstall or auto-update. Remove or change the files in
  the agent folder and rescan instead.
- The catalog source is named `<Agent> installed` and points at the physical skill root. Duplicate logical skills are
  collapsed as usual.

## Manual overrides

If a supported agent is installed in a non-standard location, **My Agents → Add manually** lets the user choose the
host, an optional executable path, and the user skills folder. The entry is persisted as `agent_manual.<host>` and
marked `manual: true` in detection results.

- The skills folder must be an absolute path inside the user's home directory.
- Manual entries bypass runtime detection but do not verify the executable. The app never executes the supplied path;
  it only uses the skills folder for installs.
- Removing a manual entry is blocked while that host has `INSTALLED` skills, so an installation cannot be orphaned.
- A real detection result can be overridden; the UI labels it **Manual entry**.
- Linux CI runs `manual_agent_detect_install_uninstall` with a temporary home skills folder: manual detection,
  install, uninstall and override removal.

## Install lifecycle

1. Resolve the published immutable version from SQLite and re-verify its content hash.
2. Refuse `QUARANTINED` or `HIGH`/`CRITICAL` versions unless the request explicitly allows risky content.
3. Resolve the host root under the user's home. Reject symlinks, reparse points, path escapes and reserved names.
4. Create an installation record, then back up any existing managed folder into app data.
5. Stage files in a hidden sibling directory; preserve untracked user extras, remove old managed files.
6. Swap atomically, verify the DB pointer, and log the operation.
7. On failure, mark the installation `FAILED`; never leave a half-written target.

Update uses the same path. Rollback restores a selected backup after backing up the current tree. Uninstall backs up
before removing files and keeps the installation history row. Imported (`origin=imported`) installations are excluded
from updates, rollback, uninstall and auto-update.

## Auto-update

The per-agent switch is stored as `agent_auto_install.<host>`. When auto-sync is enabled, a successful sync checks
installed skills for newer non-quarantined versions and updates only agents with the switch enabled. Manually triggered
updates are always available in Updates.

## Limits

- Windows is the fully validated interactive runtime.
- Linux (Ubuntu 24.04 and 26.04) and macOS arm64 have CI evidence for all seven hosts:
  `real_agents_detect_install_uninstall` detects the real executables, installs a temporary skill into each documented
  user root, verifies `SKILL.md`, and removes it. Versions and paths are recorded in `docs/CI.md`.
- Cursor uses the official `cursor-agent` CLI; Windsurf uses the current `devin-desktop` package while retaining the
  documented `~/.codeium/windsurf/skills` root.
- The desktop GUI was rendered in real CI windows on Ubuntu 24.04, Ubuntu 26.04 and macOS. Linux/macOS click-through
  flows are not automated.
- Project-scope installs are not in this slice; only user-level roots are written and scanned.
- Imported disk skills are read-only in Library; they are not managed or deleted by the app.
- No skill script, hook or install command is executed.
- Detection can miss agents that are running from an unregistered/portable binary or a desktop app with no PATH/known
  install path.
- No cloud/team sync.
