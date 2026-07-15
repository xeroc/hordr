---
# hordr-7zxr
title: checkInvocation must verify clean worktree before proceed (phantom-completion fix)
status: todo
type: bug
priority: critical
created_at: 2026-07-15T13:00:01Z
updated_at: 2026-07-15T13:00:01Z
parent: hordr-4j5j
---

## Problem

`checkInvocation` (src/dispatch/heal.ts:27) treats a bean-status flip as completion with no worktree check:

```ts
if (status === 'completed') return {action: 'proceed', reason: 'bean completed'}
```

Status is read from the **working tree**, so the instant an agent runs `beans update <task> -s completed`, the next tick sees `completed` → `proceed` → `handleDone` → rollup → lane teardown — **even if the agent has not committed its code yet.** This destroyed real work in the tributary-fot9 fleet (2026-07-15): the implementer edited `execute.ts`, ran `beans update tributary-r00t -s completed`, and the daemon rolled up + tore down the lane before the agent invoked the commit skill. The lint-clean refactor was lost; only a `chore(beans): rollup status changes` commit survived.

The heal.ts:6 comment says this poll exists to "self-heal if /done was missed" — but as written it lets an uncommitted status flip substitute for a real completion, racing the agent's own commit step.

## Change

`checkInvocation` must NOT `proceed` on `bean.status === 'completed'` alone. It must additionally verify the lane worktree is **clean** (no uncommitted changes). Concretely:

- Extend `HealDeps` with a `worktreeClean: (worktreePath: string) => boolean` (or reuse a `gitStatus` seam) that runs `git status --porcelain` in the lane worktree and returns true only when empty (or when the only changes are in the beans dir — decide and document).
- If `status === 'completed'` AND worktree is dirty with non-bean files → return `{action: 'wait', reason: 'bean completed but worktree dirty (uncommitted changes)'}`. Do NOT proceed. The daemon keeps the lane alive and (per the log) should surface the dirty state.
- If `status === 'completed'` AND worktree clean → `{action: 'proceed', ...}` as today.

The dirty-check target is the **lane** worktree (where the agent worked), so `checkInvocation`'s opts must carry the lane worktree path (it currently carries `paneId` + `taskId` only — thread the worktree path through).

## TDD checklist

- [ ] `checkInvocation`: completed + clean worktree → proceed (existing behavior preserved)
- [ ] `checkInvocation`: completed + dirty worktree (non-bean file modified) → wait, reason names dirty worktree
- [ ] `checkInvocation`: completed + dirty only in beans dir → proceed (bean-status writes are expected) — OR wait, per chosen policy; document which
- [ ] `checkInvocation`: not completed + pane alive → wait (unchanged)
- [ ] `checkInvocation`: not completed + pane gone → blocked (unchanged)
- [ ] New dep `worktreeClean` is injectable; tests mock it, no real git I/O
- [ ] Daemon wiring threads lane worktree path into checkInvocation opts
- [ ] `bun run lint` clean; `bun test` green

## Key references

- src/dispatch/heal.ts:27 — the proceed-on-completed line to gate
- src/dispatch/heal.ts:6 — comment claiming missed-/done self-heal (the race source)
- Incident: tributary-fot9 / tributary-r00t, commit 736ae944 (rollup-only, zero code); session ses_09a39f2f7ffeI3KfwLw3cYkJl2 ended after `beans update -s completed`, before the commit skill
- Related: hordr-z0ai (original heal-poll task), hordr-nlkj (/done route)

## Out of scope

- The teardown `--force` guard is a separate bean (defense-in-depth at removal time).
- The harness-prompt ordering fix is a separate bean (agent-side).
