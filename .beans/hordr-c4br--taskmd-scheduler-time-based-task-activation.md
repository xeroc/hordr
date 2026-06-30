---
# hordr-c4br
title: 'TASK.md scheduler: time-based task activation'
status: todo
type: feature
priority: deferred
created_at: 2026-06-30T06:54:31Z
updated_at: 2026-06-30T06:54:31Z
parent: hordr-kgez
---

## Requirement

Agent Companies `TASK.md` supports `schedule:` metadata (timezone, startsAt, recurring). Hordr v1 is explicitly non-scheduled (SPEC §9 non-goal: "No daemon / background scheduler"). To support whole-company orchestration, hordr needs time-based task activation.

Created as deferred tracking per 2026-06-30 strategy session.

## Spec

Deferred - will scope when we start. Likely involves:

- Phase 2 daemon watcher (already on the Phase 2 list, SPEC §10)
- Parsing `schedule:` from TASK.md / bean frontmatter
- Cron-like or event-driven firing of `hordr run`

## Acceptance Criteria

- [ ] Tasks with `schedule:` metadata activate automatically at the specified time.
- [ ] Recurring schedules supported (cron semantics TBD).
- [ ] Timezone-correct.

## Test Plan

TBD when scoped.
