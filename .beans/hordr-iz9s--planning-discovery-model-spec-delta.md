---
# hordr-iz9s
title: Planning & Discovery Model — SPEC delta
status: completed
type: task
priority: high
created_at: 2026-06-26T15:24:14Z
updated_at: 2026-06-26T15:25:52Z
---

Produce a SPEC.md delta document describing the epic-as-spec-container model, external discovery on develop, decompose command, and worktree-optional Runs. Does NOT touch SPEC.md — standalone delta for later refactor.

## Summary of Changes

Wrote `SPEC-delta-planning.md` — standalone delta document, does NOT touch SPEC.md.

Key decisions encoded:
- Epic bean body IS the spec (6-section contract)
- ADRs are files in docs/adr/, written during discovery on develop
- Discovery lives outside hordr (skill on develop)
- `hordr decompose` is the only new command — stateless, worktree-less
- Decomposed children skip planning phase, enter Run at queued
- Implementation Runs get worktrees; decompose runs on develop
- Step kinds unchanged (closed set of 8 preserved)
- No specs/ directory
