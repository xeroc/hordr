---
# hordr-a3zs
title: Delete squash.ts + squash.test.ts
status: todo
type: task
priority: normal
created_at: 2026-07-13T06:36:33Z
updated_at: 2026-07-13T06:36:33Z
parent: hordr-s725
---

squash.ts defines squashRollup (fixup + autosquash). Zero production callers — only squash.test.ts imports it. ADR-0011 specified its use but it was never wired. The rollup status changes are committed via commitBeans (git add + git commit) in advance.ts instead.

Delete both files. Remove any stale references in docs/ADR-0011 or fleet-guide.md.
