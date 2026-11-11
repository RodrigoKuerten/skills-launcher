# Sources

Sources are untrusted catalogs. Adapters fetch bytes only; validation, scanning, hashing and persistence happen in the service layer. No imported script is ever executed.

## Adapter registry

| Kind | Config / URL | Notes |
|---|---|---|
| `github_repo` | `url=https://github.com/owner/repo`, config `{repo, branch?, path?}` | Downloads the public codeload ZIP. API metadata is optional; sync works when the unauthenticated API is rate limited. Branch defaults from GitHub metadata, then `main`/`master`. |
| `github_org` | `url=https://github.com/org`, config `{limit?, branch?, path?}` | Lists public repos through the GitHub API (token recommended), scans up to 25. |
| `local_dir` | `url` = picked absolute directory | Read-only, no symlinks, ignores `.git`, `node_modules`, `target`, `dist`, `.next`, `vendor`. |
| `zip` | `url` = picked absolute `.zip` | Parsed in memory; no extraction to host directories. Rejects traversal, encryption and archive bombs; symlink entries are skipped. |
| `git_repo` | `url=https://...`, config `{branch?, path?}` | Uses system `git clone --depth 1` into an isolated temp directory; no shell, no hooks. |
| `http_json` | `url=https://...` | Versioned catalog contract below; no HTML scraping. |

## Recommended seed sources

The app seeds these by stable ID on every database open. `INSERT OR IGNORE` means existing users receive new recommended sources after an update without overwriting edits or resurrecting removed sources. Seeded sources start with auto-sync off; sync one or all explicitly.

| Source | Repository / path | Trust | License | Fresh sync |
|---|---|---|---|---|
| Anthropic Skills | `anthropics/skills` — `skills` | OFFICIAL | source repo | 19 skills (1 quarantined) |
| OpenAI Skills | `openai/skills` — `skills/.curated` | OFFICIAL | source repo | 39 skills (1 quarantined) |
| Microsoft Skills | `microsoft/skills` — `.github/skills` | OFFICIAL | source repo | 13 skills |
| Hugging Face Skills | `huggingface/skills` — `skills` | OFFICIAL | source repo | 25 skills |
| Vercel Agent Skills | `vercel-labs/agent-skills` — `skills` | VERIFIED | source repo | 9 skills |
| NVIDIA Skills | `NVIDIA/skills` — `skills` | OFFICIAL | Apache-2.0 / CC-BY-4.0 | 200 skills imported (source has more; per-source cap) |
| Cloudflare Skills | `cloudflare/skills` — `skills` | OFFICIAL | Apache-2.0 | 22 skills |
| Supabase Agent Skills | `supabase/agent-skills` — `skills` | OFFICIAL | MIT | 2 skills |
| Anthony Fu Skills | `antfu/skills` — `skills` | COMMUNITY | MIT | 14 skills |
| Kotlin Backend Agent Skills | `Kotlin/kotlin-backend-agent-skills` — `.agents/skills` | VERIFIED | MIT | 25 skills |
| OpenClaw Agent Skills | `openclaw/agent-skills` — `skills` | COMMUNITY | MIT | 9 skills |

Fresh-database sync snapshot: **377 skills**, **9 quarantined**, **11 sources**; the UI marks 27 skills at risk when
high/critical findings are included. The installed Windows app was upgraded in place, kept its original 105 skills and
then synced all six new sources through the real **Sync all** action, reaching the same 377-skill catalog with 0 console
errors. Screenshot: `docs/audit/windows-home-11-sources.png`. Upstream counts change. NVIDIA has more than the
200-skill per-source import cap.

Reproduce with:

```bash
cd apps/desktop/src-tauri
cargo test seeded_sources_sync_smoke -- --ignored --nocapture
```

`github/awesome-copilot` was evaluated but is not seeded: its repository archive exceeds the codeload expansion budget before the `skills/` subpath can be scanned. Adding it would require a partial-archive adapter.

## GitHub behavior

- Public repositories use `https://codeload.github.com/...` directly. This keeps sync usable when the GitHub API allows only 60 requests/hour.
- Optional token is held in memory for the current app session only; it is never written to SQLite.
- Archive cap: 128 MB compressed/uncompressed budget, 15,000 entries, 1,000 text files per skill, 512 KB per file, 32 MB per skill, 200 skills per source.
- GitHub organization sync requires API access and may fail on rate limits; the error is explicit.

## HTTP JSON contract

```json
{
  "version": 1,
  "skills": [
    {
      "name": "Example Skill",
      "description": "What it does",
      "version": "1.0.0",
      "license": "MIT",
      "repository_url": "https://github.com/owner/repo",
      "homepage_url": "https://example.com",
      "author": "owner",
      "stars": 0,
      "category": "productivity",
      "files": [
        { "path": "SKILL.md", "content": "---\nname: Example Skill\n---\n..." }
      ]
    }
  ]
}
```

The top level may also be an array of skill objects. `SKILL.md` is required in every skill. All file paths are POSIX-relative, cannot contain `..`, backslashes, reserved Windows names or trailing dots/spaces. Catalog responses are capped at 20 MB and 100 skills.

## Sync result

Each sync writes a `source_runs` row and updates source status. Skills are deduplicated by `(source_id, source_path)`; versions by `(skill_id, content_hash)`. A changed hash creates a new immutable version and moves `latest_version_id`. A removed skill is not deleted automatically - installed provenance remains.

## Scanner

The scanner checks prompt-injection language, exfiltration/destructive commands, secret requests, remote execution, safety bypass language, hidden Unicode, non-HTTPS/raw-IP/shortener links, and script file types. `HIGH`/`CRITICAL` findings quarantine the version and block install. Findings and `scanner_version` are stored per version.

## Security limits

- No symlinks/reparse points in local sources or host installs; symlink ZIP entries are skipped. Encrypted ZIPs, path traversal, absolute paths, case collisions and reserved Windows names are rejected.
- No adapter fetch of URLs discovered inside skill content.
- No execution of imported code, scripts, hooks or install commands.
- Local and ZIP sources require a native picker grant; raw webview paths are rejected.
- Tokens never enter logs, errors or the database.

## Known limits

- Source config editing is limited to the fields exposed in the UI; GitHub branch/subpath editing uses the source form.
- Auto-sync runs on a 5-minute scheduler when enabled in Settings and the source has `autoSync`. There is no durable
  job queue or retry/backoff yet.
- Windows has full interactive validation. Ubuntu 24.04, Ubuntu 26.04 and macOS build, render the real Tauri window
  and run real detection/install/uninstall for all seven supported agents in CI (`docs/CI.md`).
