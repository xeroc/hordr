---
# hordr-2ktb
title: Move GitFn to runtime.ts, import in merge.ts
status: todo
type: task
priority: normal
created_at: 2026-07-13T06:36:34Z
updated_at: 2026-07-13T06:36:34Z
parent: hordr-xc22
---

1. Ensure runtime.ts exports: `export type GitFn = (args: string[], opts: {cwd: string}) => void`
2. In merge.ts: remove local `export type GitFn`, import from runtime.ts instead.
3. Update any imports of GitFn from merge.ts in other files (broker.ts, etc.) to import from runtime.ts.
4. Delete GitRunner alias if still present — GitFn is the canonical name.

After epic 2, squash.ts and branch.ts are already gone, so only merge.ts needs updating.
