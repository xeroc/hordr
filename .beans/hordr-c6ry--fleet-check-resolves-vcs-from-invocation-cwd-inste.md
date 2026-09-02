---
# hordr-c6ry
title: fleet check resolves VCS from invocation cwd instead of the fleet's project
status: completed
type: bug
priority: high
created_at: 2026-09-02T14:40:13Z
updated_at: 2026-09-02T14:54:37Z
---

Running hordr fleet check (or hordr done) outside the project tree loads the zero-config default (default_vcs: git) because loadConfig walks up from process.cwd(). A jj fleet then creates lanes via herdr worktree create against a jj workspace and fails with not_git_worktree. Agent personas also get git commit contracts in jj workspaces. Fix: resolve the per-fleet config (.beans.yml) from the fleet's project root (fleet.projectRoot || projects.beans_path) inside the engine, fall back to the invocation config when unreadable.

## Summary of Changes

- engine.ts: per-fleet config resolution (fleetConfigFor) — findConfigPath from fleet.projectRoot (fallback projects.beans_path) → loadConfig → getVcs; memoized per config path; falls back to invocation config when missing/unparseable. Shadows engine-wide config/vcs in advanceLane, the scanFleet loop, and continueTask, so adapter AND vcs-specific agent personas/commit contracts match the fleet's project. Engine-wide vcs deleted (dead); reattachLaneWorkspace hoisted to module scope with vcs param.
- loader.ts: exported findConfigPath.
- Tests: hordr-c6ry suite in test/dispatch/engine.test.ts — jj-project fleet invoked with git config creates lanes via jj workspace add (no herdr worktree create); git fallback preserved when no .beans.yml. Verified live: riprap-dw8b resolves default_vcs jj → jj adapter from any cwd.
