# ADR-006: Immutable versions identified by canonical content hash

**Status:** accepted

## Context
Tags and branch names move. Monitoring must detect actual changes, support rollback and avoid duplicate versions. Imports must be platform-stable enough to install.

## Decision
For each skill root (the directory containing `SKILL.md`), select files under that root excluding `.git`, `node_modules`, lockfiles, files over 512 KB, and sets over 80 files / 4 MB. Compute `perFile = sha256(utf8(path) + NUL + decoded bytes)`. The set hash is `sha256(concat(perFile digest bytes in path order))`. A version is unique by `(skillId, contentHash)`.

Commit SHA, tree SHA and release metadata are stored for provenance but are not the identity. Publishing is a transaction that moves `Skill.currentVersionId` and rebuilds host compatibility rows.

## Consequences
- Version comparison is exact and does not depend on semver.
- Byte-level differences (e.g., line endings) create new versions; the hash is documented as byte-exact.
- ZIP bytes are not compared to the set hash; verification uses extracted per-file hashes and the set hash.
