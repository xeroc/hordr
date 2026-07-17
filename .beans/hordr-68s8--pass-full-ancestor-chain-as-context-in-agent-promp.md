---
# hordr-68s8
title: Pass full ancestor chain as context in agent prompt
status: completed
type: task
priority: normal
created_at: 2026-07-13T15:13:24Z
updated_at: 2026-07-13T15:39:58Z
---

## Requirement

When dispatching a leaf bean (task or childless feature) to the harness, include the full ancestor chain (milestone → epic → feature) as READ-ONLY context. The leaf bean remains the only one to implement.

## Acceptance Criteria

- [ ] buildInvocationPrompt accepts optional ancestors array
- [ ] Ancestors rendered as context-only section before the leaf
- [ ] Leaf bean clearly marked IMPLEMENT THIS
- [ ] fetchAncestorChain walks parent chain root→leaf with body+title+type
- [ ] dispatchNext (loop.ts) passes ancestor chain to buildInvocationPrompt
- [ ] buildPrompt (launcher.ts) accepts and renders ancestors
- [ ] launchAgent fetches and passes ancestor chain
- [ ] All callers wired (engine.ts, advance.ts, fleet/create.ts)
- [ ] Tests pass

## Summary of Changes

- Added AncestorContext interface + updated buildInvocationPrompt to accept optional ancestors array
- Ancestor beans rendered as READ-ONLY context section before the leaf
- Leaf bean clearly marked IMPLEMENT THIS
- Added fetchAncestorChain in dispatch.ts (GraphQL parent traversal, root→leaf)
- Threaded fetchAncestorChain through DispatchDeps → dispatchNext (loop.ts)
- Wired in engine.ts, advance.ts, tick.ts (deps forwarding)
- Updated buildPrompt + launchAgent in launcher.ts (single-bean path)
- Updated test helper (fleet-engine.ts) + all affected tests
- 253 tests passing, 0 lint errors
