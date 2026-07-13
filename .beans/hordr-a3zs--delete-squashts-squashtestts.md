---
# hordr-a3zs
title: Delete squash.ts + squash.test.ts
status: completed
type: task
priority: normal
created_at: 2026-07-13T06:36:33Z
updated_at: 2026-07-13T07:52:12Z
parent: hordr-s725
---

squash.ts defines squashRollup (fixup + autosquash). Zero production callers — only squash.test.ts imports it. ADR-0011 specified its use but it was never wired. The rollup status changes are committed via commitBeans (git add + git commit) in advance.ts instead.

Delete both files. Remove any stale references in docs/ADR-0011 or fleet-guide.md.

## Summary of Changes

- Deleted `src/dispatch/squash.ts` and `test/dispatch/squash.test.ts` (zero production callers; rollup commits via `commitBeans` in `advance.ts`).
- `docs/fleet-guide.md`: removed `squashRollup` from the broker-responsibilities table.
- `docs/adr/0011`: added amendment noting fixup+autosquash was never wired; rollup now commits via `commitBeans`.
- `docs/adr/0014`: removed the `squashRollup` row from the module-changes table (module no longer exists).
