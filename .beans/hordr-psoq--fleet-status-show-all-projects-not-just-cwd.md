---
# hordr-psoq
title: 'fleet status: show all projects, not just cwd'
status: completed
type: bug
priority: high
created_at: 2026-07-29T09:44:44Z
updated_at: 2026-07-29T09:50:13Z
---

hordr fleet status (no milestone arg) filters by current project only. The DB is global (~/.hordr/hordr.db) and listFleets already supports no-filter. Fix: list all projects. Also latent bug: listLanes uses cwd projectKey not f.projectKey.

## Summary of Changes

- `src/commands/fleet/status.ts`: no-milestone path now calls `listFleets(db)` with no project filter → lists fleets across ALL projects (the DB at ~/.hordr/hordr.db is already global).
- Fixed latent bug: `listLanes` calls used the cwd `projectKey` instead of `f.projectKey` → cross-project lanes never resolved. Now uses `f.projectKey` in both text + JSON paths.
- Text output now includes `[projectKey]` on each fleet line so multi-project lists are identifiable.
- Empty message changed from 'no fleets for project X' to just 'no fleets'.
- Tests: +3 cross-project tests (human, JSON, empty), all 326 pass.
