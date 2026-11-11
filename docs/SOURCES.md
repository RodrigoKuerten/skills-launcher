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
| Matt Pocock Skills | `mattpocock/skills` — `skills` | VERIFIED | MIT | 39 skills |
| Superpowers | `obra/superpowers` — `skills` | VERIFIED | MIT | 15 skills |
| Addy Osmani Agent Skills | `addyosmani/agent-skills` — `skills` | VERIFIED | MIT | 25 skills (2 quarantined) |
| Marketing Skills | `coreyhaines31/marketingskills` — `skills` | VERIFIED | MIT | 53 skills (2 quarantined) |
| Wshobson Agent Skills | `wshobson/agents` — `plugins` | COMMUNITY | MIT | 185 skills |
| Baoyu Skills | `JimLiu/baoyu-skills` — `skills` | VERIFIED | MIT | 21 skills (1 quarantined) |
| Firebase Agent Skills | `firebase/agent-skills` — `skills` | OFFICIAL | Apache-2.0 | 14 skills |
| Google Agents CLI Skills | `google/agents-cli` — `skills` | OFFICIAL | Apache-2.0 | 7 skills |
| Google DeepMind Science Skills | `google-deepmind/science-skills` — `skills` | OFFICIAL | Apache-2.0 | 40 skills |
| Expo Skills | `expo/skills` — `plugins` | OFFICIAL | MIT | 24 skills |
| Prisma Skills | `prisma/skills` — root | OFFICIAL | MIT | 11 skills |
| Softaworks Agent Toolkit | `softaworks/agent-toolkit` — `dist` | COMMUNITY | MIT | 43 skills |

Fresh-database sync snapshot: **854 skills**, **14 quarantined**, **38 at risk**, **23 sources**. The previous 11-source
snapshot had 377 skills; the 12 added sources contribute 477 real skills. Upstream counts change. NVIDIA has more than
the 200-skill per-source import cap.

All 23 seeded sources were synced together with `seeded_sources_sync_smoke`; every source returned `status=ok`, no
archive/path errors. The installed Windows catalog is refreshed through the real **Sync all** action after this change.

Reproduce with:

```bash
cd apps/desktop/src-tauri
cargo test seeded_sources_sync_smoke -- --ignored --nocapture
```

## Researched but not seeded

These are real, high-signal sources that failed a hard requirement (license or archive budget):

- `K-Dense-AI/scientific-agent-skills`: 177 skills, MIT, but the repository is ~471 MB and exceeds the archive budget.
- `sickn33/agentic-awesome-skills`: 9,080 `SKILL.md` files, MIT, but ~451 MB and far beyond the per-source cap.
- `github/awesome-copilot`: real `skills/` directory, MIT, but the repository archive expands beyond the codeload
  budget before subpath filtering.
- `JetBrains/skills`, `browserbase/skills`, `remotion-dev/skills`, `Shopify/agent-skills`: real skills found, but no
  license file/license metadata was detected, so they were not imported.

A partial-archive/sparse-source adapter would be required to include the oversized catalogs without downloading the
entire repository.

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
