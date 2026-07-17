---
# hordr-hge8
title: 'Fix harness prompt: commit code+bean together before signalling done'
status: completed
type: task
priority: high
created_at: 2026-07-15T13:01:23Z
updated_at: 2026-07-15T13:24:16Z
parent: hordr-4j5j
---

## Problem

The agent harness prompt instructs status-first-then-commit, which is the exact ordering that triggers the phantom-completion race (before the daemon-side guards in hordr-7zxr / hordr-wd46 land):

Current prompt text (e.g. .beans.yml around the implementer role + the dispatch prompt template):

> "For a (child) beans, when done, **first update the bean status** (and every descendant you satisfied), **then use the commit skill** for all the changes, including the bean(s)."

In the tributary-fot9 incident the implementer followed this literally: it ran `beans update tributary-r00t -s completed`, then its session ended before it reached the commit skill. The daemon saw the status flip and tore the lane down before the code was committed. Status-first turns the bean flip into the daemon's completion signal *before* the work exists in git.

## Change

Invert and atomicize the ordering in the prompt template(s) that drive single-task implementers (look in: .beans.yml, src/dispatch/spawn.ts / buildPrompt, src/harness/buildPrompt, and any prompt files under skills/hordr or the project AGENTS.md task section). New contract:

1. Make the code edits.
2. Verify (lint / typecheck / tests per the bean).
3. **Commit code + bean status flip together in ONE commit** via the commit skill — stage the code changes AND the bean file (with `status: completed` + `## Summary of Changes`) in the same commit. Do not flip status in a separate step.
4. Only AFTER the commit lands, signal done (`/done` or `hordr done`).
5. Never leave the bean marked `completed` in the working tree uncommitted. If you must stop mid-work, the bean stays `in-progress`.

Make the wording unambiguous that the status flip is part of the commit, not a precondition for it.

## TDD checklist

- [ ] Locate every prompt template that tells implementers to flip status before committing (.beans.yml, spawn.ts/buildPrompt, AGENTS.md task section, skills/hordr/*)
- [ ] Rewrite each to the commit-then-signal-done ordering above; status flip rides inside the commit
- [ ] Add an explicit "never leave status: completed uncommitted" rule
- [ ] Cross-reference the daemon-side guards (hordr-7zxr, hordr-wd46) so the prompt notes the daemon now requires a clean worktree to proceed
- [ ] If there is a test/snapshot of the generated prompt, update it
- [x] `bun run lint` clean

## Key references

- .beans.yml:29-33 — the status-first-then-commit instruction (the trigger)
- src/dispatch/spawn.ts / src/harness/buildPrompt — prompt assembly
- Incident: tributary-fot9 / tributary-r00t — agent followed the old ordering and never reached the commit step
- Depends on (for end-to-end safety): hordr-7zxr (checkInvocation clean gate), hordr-wd46 (teardown guard)

## Notes

This is the agent-side layer of a three-layer defense. On its own it relies on agent discipline; combined with the daemon-side guards it makes the completion contract unambiguous at every layer.

## Summary of Changes

Inverted the agent completion ordering from status-first-then-commit to commit-then-signal-done across every prompt template that drives single-task implementers. The bean status flip now rides INSIDE the commit, never as a separate step before it.

Changed:
- `src/dispatch/spawn.ts` (PRIMARY): rewrote the `## Completion` section of `buildInvocationPrompt` to the 5-step contract (edit → verify → commit code+bean together → signal done → never leave completed uncommitted). Cross-references hordr-7zxr / hordr-wd46 and notes the daemon requires a clean worktree to proceed.
- `src/config/defaults.ts`: rewrote the implementer, reviewer, and tester default personas to the commit-then-signal-done contract.
- `docs/fleet-guide.md`: rewrote the three role example personas (implementer/tester/reviewer).
- `README.md`: rewrote the implementer persona example.
- `test/dispatch/spawn.test.ts`: updated the prompt snapshot assertions to verify the new contract (commit-before-done ordering, the Do-NOT-run-as-separate-step prohibition, the never-leave-completed-uncommitted rule, and the clean-worktree requirement).

Not changed (already lacked the status-first instruction): `.beans.yml`, `AGENTS.md`, `.agents/skills/hordr/SKILL.md`. Historical `.beans/*.md` records left untouched.

Verification: `bun run lint` clean (0 errors, 4 pre-existing warnings); `bun test test/dispatch/spawn.test.ts` 7/7 pass; full suite 177 pass / 86 fail identical before and after (all 86 failures are the pre-existing better-sqlite3 native-binding error under bun, unrelated to this change).
