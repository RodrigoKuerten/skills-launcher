# Security model

Skills Launcher treats every source, archive, and skill as untrusted data. Imported code is never executed.

## Boundaries

- **UI**: React only; all filesystem/network/process work happens through typed Rust commands. Untrusted HTML is never
  rendered; READMEs use a React-only renderer, external links go through the HTTPS `open_url` command.
- **Sources**: adapters read bounded bytes. HTTP clients have redirects disabled; HTTP/JSON and Git sources pre-resolve
  the host and reject localhost/private addresses. ZIPs are parsed in memory, never extracted to disk.
- **Validation**: POSIX-relative paths only; `..`, backslashes, absolute/drive/UNC paths, reserved Windows names,
  trailing dots/spaces, case collisions, symlinks and reparse points are rejected. Archive entry counts, bytes,
  compression ratio, per-file and per-skill budgets are capped.
- **Scanner**: prompt injection, exfiltration, destructive/remote execution, safety bypass, secret requests, hidden
  Unicode, non-HTTPS/raw-IP/shortener links and script files. Findings are scored over all findings before display
  truncation. `CRITICAL` is quarantined; `HIGH`/`CRITICAL` installs require an explicit override.
- **Install**: content hash is re-verified from SQLite; backups precede mutation; staging is a hidden sibling; swaps are
  atomic; user extras are preserved; old managed files are removed; unmanaged existing folders are refused. Symlinks and
  reparse points are rejected throughout. Installs are serialized.
- **Backups**: stored outside host roots with a manifest beside the tree. Restore recomputes the tree hash and refuses a
  mismatch.
- **Secrets**: GitHub tokens live in memory only, are never written to SQLite/exports/errors, and are passed to adapters
  as bearer auth. Source URLs reject embedded credentials and query strings.
- **Webview**: production CSP restricts scripts/styles/images/fonts and IPC; `withGlobalTauri` is false; capabilities
  only expose the dialog plugin.

## Residual risks / limits

- Windows/WebView2 is the only fully interactive flow validated. Linux and macOS compile, pass the shared Rust tests,
  render the real Tauri window, and pass an OpenCode 1.19.5 detection/install/uninstall smoke in CI (`docs/CI.md`).
  Other agent hosts and click-through GUI flows on Linux/macOS are not verified.
- DNS rebinding between host validation and connect is not fully prevented; use connect-time pinning if remote catalogs
  become a shared service. Git itself follows its own transport rules (redirects disabled above).
- Checksums prove integrity, not author authenticity. Source trust is a user-visible signal, not a signature.
- Backups are retained without automatic age/count pruning yet; disk use grows with update/remove history.
- Project-scope installs, cloud sync, remote catalog accounts and app code signing are future work.
- Local/ZIP path grants are session-scoped; imports containing those paths are rejected and must be re-added with the
  native picker.
