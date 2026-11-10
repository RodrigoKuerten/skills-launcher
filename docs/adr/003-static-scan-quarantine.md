# ADR-003: Static scanning and per-version quarantine

**Status:** accepted

## Context
Skills contain instructions and scripts that could exfiltrate data, run destructive shell commands, or hide prompt injection. The platform must not execute imported content, and popularity must not be treated as safety.

## Decision
Run a deterministic static scanner over every imported file set. Findings are categorized and scored. Any HIGH/CRITICAL finding makes the version unpublishable. Community imports are quarantined regardless of score. Publishing is an explicit pointer move performed only by the publish helper or an admin approval; downloads and manifests require a `PUBLISHED` version.

Scanner version is stored per version so the verdict is auditable. The UI states that scans are heuristics, not a guarantee.

## Consequences
- False positives are possible; admins can review and reject or approve, but no scan bypass is silent.
- Old published versions remain available when a new version is quarantined.
- Detecting novel obfuscation is out of scope for a regex/heuristic scanner; add sandboxed analysis later.
