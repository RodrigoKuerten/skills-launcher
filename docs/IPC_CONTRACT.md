# Skills Launcher — Desktop IPC contract

The webview never reads files, runs processes, or calls the network directly. Every operation goes through a Tauri command implemented in Rust. All payloads use camelCase keys.

## Bootstrap

- `get_bootstrap() -> Bootstrap`
- `get_stats() -> Stats`
- `list_categories() -> Category[]`
- `list_sources() -> Source[]`
- `get_settings() -> Settings`
- `update_settings({ input: SettingsInput }) -> Settings`
- `open_url({ url }) -> null` — HTTPS only, rejects embedded credentials.

`Bootstrap` contains `{ stats, sources, categories, settings, recentOperations }`.

## Catalog

- `list_skills({ query: SkillQuery }) -> SkillPage`
  - `SkillQuery`: `{ q?, category?, sourceId?, host?, risk?, trust?, sort?, page?, pageSize?, includeBlocked? }`
  - `sort`: `quality | recent | name | stars | security`
- `get_skill({ id }) -> SkillDetail`
- `list_installations() -> Installation[]`
- `list_updates() -> UpdateItem[]`

A quarantined skill is excluded unless `includeBlocked` is true or a risk filter is used. Empty catalog is a valid state; never substitute sample skills.

## Sources

- `add_source({ input: SourceInput }) -> Source`
- `update_source({ id, input: SourceInput }) -> Source`
- `set_source_enabled({ id, enabled }) -> Source`
- `delete_source({ id }) -> null` — soft delete; installed files are untouched.
- `sync_source({ sourceId }) -> SyncSummary`
- `sync_all_sources() -> SyncSummary[]`
- `list_source_runs({ sourceId?, limit? }) -> SourceRun[]`
- `export_sources() -> SourceExport`
- `import_sources({ json }) -> Source[]`
- `pick_source_path({ kind: "dir" | "zip" }) -> string | null` — opens the native picker and grants the path for local/ZIP source add/edit.

`SourceInput`: `{ name, kind, url, author?, description?, config?, trust?, enabled?, autoSync?, intervalMinutes? }`.
`Settings`: `{ theme, autoSync, autoSyncIntervalMinutes, githubTokenSet }`. The GitHub token is memory-only for the
current session; `githubTokenSet` reflects that, not a persisted secret.
`kind`: `github_repo | github_org | local_dir | zip | git_repo | http_json`.

Local and ZIP sources must be picked with `pick_source_path`; raw paths from the webview are rejected. Source deletes are soft so installed libraries keep provenance.

## Agents and installs (next backend slice)

- `detect_agents() -> DetectedAgent[]`
- `set_agent_auto_install({ host, enabled }) -> DetectedAgent[]`
- `install_skill({ request: InstallRequest }) -> InstallResponse`
- `update_installation({ id }) -> InstallResponse`
- `uninstall_skill({ id, removeFiles }) -> null`
- `rollback_installation({ id, backupId? }) -> InstallResponse`
- `list_backups({ installationId? }) -> Backup[]`
- `list_operations({ limit? }) -> Operation[]`
- `apply_auto_updates() -> InstallOutcome[]` — updates installed skills for hosts with auto-update enabled.

Detection is evidence-based: executable/version probe or a real app artifact, never directory existence alone. Undetected hosts are export-only.

## Events

- `catalog-updated` — emitted after a source sync; payload is a `SyncSummary` or array. Listen with `@tauri-apps/api/event` and refresh bootstrap/lists.
- `library-updated` — emitted after install/update/rollback or auto-update; refresh installations and updates.

## Error shape

Commands reject with a human-readable string. UI should show it in a toast and keep the current screen state. Do not display raw HTML from errors.

## Security rules for the UI

- Markdown readmes are rendered with raw HTML disabled; external links call `open_url`.
- Never render untrusted `file://`, `javascript:`, `data:` or `http:` links.
- Never construct install paths from skill content. Hosts own their paths.
- Do not invent compatibility, ratings, download counts, or detection.
- Use the logo at `/logo.png` and the brand tokens in `src/styles.css`.
