# Base by invocation position; `primary_branch` removed

**Amends:** ADR-0005 (worktree-per-bean — base changes from configured trunk to current ref), ADR-0009 (fleet serialization — ms base + merge-back target), ADR-0014 (per-epic worktrees — lane base unchanged: still the ms line).
**Date:** 2026-09-25.

## Context

`primary_branch` (default `develop`) was a per-repo trunk: every worktree branched from it, every finish merged back into it. Two problems:

1. **Wrong model for how fleets actually start.** A fleet begins from wherever the human stands — a feature branch, a spike, a jj workspace — not necessarily the configured trunk. Basing `ms/<id>` on `primary_branch` silently drops the invoker's position, and `fleet finish` landing on a branch the human never stood on is surprising.
2. **jj workspaces broke `fleet create` outright.** Invoked from a jj workspace, the bean read ran with cwd = that workspace, whose working copy predates the milestone bean → `BeansError: bean not found`. And the invocation dir was stored as `projectRoot`/`beans_path`, so later engine passes ran herdr workspace creation from a linked worktree (rejected) and beans reads from a stale copy.

## Decision

**There is no configured trunk. Every base is positional.**

- `Vcs.currentRef(cwd)` is hordr's "current branch": git — the checked-out branch (`git branch --show-current`, `''` on detached HEAD); jj — the nearest ancestor bookmark of the workspace head (`heads(::@ & bookmarks())`, `''` when un-bookmarked). A jj workspace ahead of its bookmark reports the bookmark; `--base <revset>` opts into WIP heads.
- `hordr fleet create [--base]` bases the ms workspace on the invocation dir's current ref and **records it on the fleet row** (`fleets.base_ref`). `hordr fleet finish` merges back into the recorded base (fallback chain: `--base` → `fleet.base_ref` → current ref of the fleet's main repo). Pre-`base_ref` fleets migrate via a guarded `ALTER TABLE`.
- `hordr run` / `hordr prompt` / `hordr finish` default their base/target to the invocation dir's current ref. Detached HEAD / un-bookmarked ancestry → actionable error demanding `--base`.
- `fleet create` resolves the **main checkout** (`dirname(projectKey)`) once and runs git/beans/herdr against it — bean reads fall back there when the invocation workspace can't see the bean, and `projectRoot`/`beans_path` store the main checkout, not the workspace. Works identically from the main repo, a git worktree, or a jj workspace.
- Engine settle (merger resolved ms→base): jj moves the recorded base bookmark to the resolved merge. A resolved jj merge with **no** recorded base parks the fleet in `conflict` instead of tearing down the workspace — teardown would drop the only copy of the resolved work. git ignores the target (the merge already landed on the checkout).
- `registerFleet` is an upsert: `fleet create` is the documented recovery for a quarantined (broken) fleet, and the old plain INSERT PK-conflicted on exactly that path.

## Consequences

- `primary_branch` is removed from the schema, `hordr config`, and all docs. Old `.beans.yml` files carrying the key still load (zod strips unknown keys) — the line is simply dead.
- Bases are deterministic per fleet (recorded at create), not re-derived live.
- `hordr finish` merges into whatever is checked out where you run it — the fixed `develop` target is gone. That is the requested semantics; `--base` is the escape hatch.
- Single migration: `fleets.base_ref TEXT NOT NULL DEFAULT ''`, added by `applySchema`'s guarded `ALTER` — still no migration runner (the comment's YAGNI holds until a second column ships).
