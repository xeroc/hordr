---
# hordr-ekgs
title: Resolve beans binary globally — single BEANS_BIN shared by all callers
status: completed
type: bug
priority: high
created_at: 2026-07-29T11:32:55Z
updated_at: 2026-07-29T11:44:03Z
---

dispatch.ts hardcodes 'beans' → ENOENT when not on PATH. client.ts has its own IIFE resolution that dispatch never benefits from. Create src/beans/bin.ts with BEANS_BIN (env BEANS_BIN_PATH → command -v → 'beans'), shared by client.ts + dispatch.ts.

## Summary of Changes

**Root cause:** `dispatch.ts` hardcoded `execFileSync('beans', ...)` while `client.ts` had its own IIFE resolution (`command -v beans`). dispatch.ts never benefited from the resolution → ENOENT when beans not on PATH.

**Fix:**
- New `src/beans/bin.ts` — single resolution point: `BEANS_BIN_PATH` env var → `command -v beans` → `'beans'` fallback. Mirrors the `HERDR_BIN_PATH` pattern.
- `src/beans/client.ts` — replaced IIFE with `import {BEANS_BIN} from './bin.js'`.
- `src/dispatch/dispatch.ts` — replaced hardcoded `'beans'` with `BEANS_BIN`.

**Escape hatch:** set `BEANS_BIN_PATH=/absolute/path/to/beans` when beans isn't on PATH (cron, restricted environments). Same pattern as `HERDR_BIN_PATH`.

333 tests pass, 0 lint errors.

## Update: real root cause was NOT beans binary resolution

The `ENOENT` was **not** the beans binary missing — it was `execFileSync` failing because the **cwd** (a fleet's `worktreePath`) doesn't exist. Node misleadingly names the binary in the error, not the cwd.

**Fix in status.ts:** `safeDrafts()` wraps `listDrafts()` in try/catch. When the worktree is gone (old fleet, torn down, different host), drafts silently return `[]` instead of crashing `hordr fleet status`.

The beans binary resolution (`BEANS_BIN_PATH` env → `command -v` → fallback) is still valid and shared — that was a real duplication. But the ENOENT was the cwd, not the binary.

334 tests pass.
