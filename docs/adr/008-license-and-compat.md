# ADR-008: License-aware distribution and honest compatibility

**Status:** accepted

## Context
The platform mirrors third-party skill files. Redistribution rights vary. "Compatible" is easy to claim and hard to prove. Both are trust issues.

## Decision
- Capture the SPDX license from the source repository and/or skill frontmatter.
- Allow full mirror/download only for a permissive allowlist (MIT, Apache-2.0, BSD-2/3, ISC, MPL-2.0, Unlicense, CC0, 0BSD). Otherwise expose metadata, instructions and a link to the original source.
- Include a NOTICE with attribution in every ZIP.
- Compatibility rows represent **format validation only** against documented host requirements. Auto-install is a separate runtime claim made by the companion after detecting the host. UI copy must not conflate trust, scan score and compatibility.

## Consequences
- Some official skills are source-only (e.g., repos without a detected license).
- New hosts/fields require updating `packages/core/src/hosts.ts` and its tests.
- A future manifest signature can add authenticity on top of integrity.
