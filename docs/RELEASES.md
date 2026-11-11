# Releases

Releases are built by `.github/workflows/release.yml` when a tag matching `v*` is pushed. The workflow can also be
started manually to test bundle builds; publishing is skipped unless the ref is a tag.

## Versioning

- Tag and app version must match: `v0.2.0` for `version: 0.2.0`.
- Pushing the tag is the release action; do not create the GitHub Release manually.
- If a build fails before the release exists, delete/recreate the tag after the fix.

## Assets

| Platform | Bundle | Source |
|---|---|---|
| Windows x64 | NSIS `.exe` | `apps/desktop/src-tauri/target/release/bundle/nsis/` |
| Linux x64 | `.deb` and AppImage | `apps/desktop/src-tauri/target/release/bundle/` |
| macOS arm64 | unsigned `.dmg` | `apps/desktop/src-tauri/target/release/bundle/dmg/` |

The publish job generates `SHA256SUMS.txt` and uploads every asset to the GitHub Release.

## Local release build

```bash
npm ci
npm run build -w @skills-launcher/desktop
```

Platform-specific targets live in `tauri.linux.conf.json` and `tauri.macos.conf.json`; Windows keeps the base NSIS
target.

## Known limits

- macOS and Linux builds are unsigned; macOS Gatekeeper will require explicit approval.
- The current macOS asset is Apple Silicon only.
- The release workflow does not build a Windows MSI; NSIS is the supported Windows installer.
- AppImage and DMG creation depend on Tauri's platform bundlers and are validated in GitHub Actions, not on this
  Windows development machine.
