---
# hordr-jzja
title: fleet status drafts-awaiting-review section
status: completed
type: task
priority: normal
created_at: 2026-07-07T20:31:17Z
updated_at: 2026-07-09T07:57:02Z
parent: hordr-a67q
---

fleet status lists beans under the milestone with status==draft, so the human sees what awaits review. Approval workflow = beans update <id> -s todo. No new command — reuses the intervene-via-bean-edits model.

## Summary of Changes

- `src/dispatch/dispatch.ts`: `listDrafts(milestoneId)` — queries the bean tree, returns status==draft descendants (any depth), reuses the dispatch shell seam
- `src/commands/fleet/status.ts`: renders a "drafts awaiting review" section (human) + `drafts[]` in --json, with the approval hint (beans update <id> -s todo)
- Tests: listDrafts unit test (draft at nested + top level), status command drafts human + json

No new command — reuses the intervene-via-bean-edits model.
