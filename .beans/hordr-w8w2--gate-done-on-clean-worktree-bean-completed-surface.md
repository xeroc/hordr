---
# hordr-w8w2
title: Gate /done on clean worktree + bean completed, surface errors to agent
status: completed
type: bug
priority: high
created_at: 2026-07-16T12:14:55Z
updated_at: 2026-07-16T12:39:49Z
---

The /done route is wired to always-pass (daemon.ts verifyCompleted returns true with a comment saying /done is 'a notification, not a gate'). The agent gets no feedback if it forgot to commit or forgot to mark the bean completed — it only learns via the 5s heal poll.

Make /done a real acceptance gate: verify (a) the worktree is clean (no uncommitted changes) and (b) the bean is marked completed. On failure, return specific, actionable errors in the 409 so the agent can fix and retry.

Race handling: a heal tick can land between mark-completed and /done, clearing currentTaskBeanId. If no lane owns the task, heal already verified clean+completed → ack OK idempotently (no false failure).

## Acceptance Criteria

- [ ] RED: runDoneChecks returns ok when bean completed + clean worktree
- [ ] RED: runDoneChecks returns specific error when bean not completed
- [ ] RED: runDoneChecks returns specific error when worktree dirty
- [ ] RED: runDoneChecks returns BOTH errors when both fail
- [ ] RED: runDoneChecks acks OK when no lane owns the task (heal race)
- [ ] RED: handleDone surfaces the verify errors in the 409 body
- [ ] GREEN: DoneDeps contract verify -> VerifyResult; add runDoneChecks(taskId, probes)
- [ ] GREEN: broker doneRouteHandler/wireDaemon carry verify
- [ ] GREEN: daemon wires real probes (findLaneByTask + getBean + git porcelain)
- [ ] update done.test.ts + broker.test.ts to new contract
- [x] lint + typecheck clean

## Summary of Changes

- dispatch/done.ts: DoneDeps.verify now returns VerifyResult {ok, errors[]}. New pure runDoneChecks(taskId, probes) runs the acceptance gate: (a) bean status == 'completed', (b) git porcelain empty (clean dir). Each failure yields a specific, actionable message naming the bean, the bad status, and the fix (commit / beans update -s completed, then retry). runDoneChecks is extensible — add a probe, add an assert.
- Race handling: if no lane owns the task (worktreePath probe returns undefined), heal already verified clean+completed → ack OK idempotently. No false failure.
- daemon/broker.ts: doneRouteHandler + wireDaemon carry verify: (taskId) => VerifyResult.
- commands/daemon.ts: verify closure wires real probes (findLaneByTask.worktreePath, getBean.status, gitStatusPorcelain). gitStatusPorcelain helper runs git -C <cwd> status --porcelain; on git failure returns a sentinel so /done fails loud (mirrors dirtyNonBeansPaths). Removed the old always-true verifyCompleted + its 'notification not a gate' comment.
- test updates: done.test.ts (new contract + 5 runDoneChecks cases), broker.test.ts (VerifyResult mock). 298 passing, lint/typecheck clean.

## Design note

This reverses the prior 'always-accept /done' decision. The old concern (heal may have cleared currentTaskBeanId causing a false 409) is handled by the no-lane → OK idempotent path. Net effect: the agent gets immediate, specific feedback at done-time instead of silently waiting for the 5s heal poll.
