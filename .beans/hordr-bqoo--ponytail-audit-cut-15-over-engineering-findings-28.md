---
# hordr-bqoo
title: 'Ponytail audit: cut 15 over-engineering findings (~280 lines)'
status: in-progress
type: task
priority: high
created_at: 2026-06-27T14:32:29Z
updated_at: 2026-06-27T14:32:29Z
---

## Requirement

Audit found 15 items totaling ~280 lines of unnecessary complexity. All are production code in src/ — no correctness changes, only simplification.

## Spec

1. Delete 6 barrel files; update test imports to point at inner modules.
2. Collapse 11 Error subclasses to plain Error (zero instanceof checks). Keep HerdrWaitTimeout only if something catches it.
3. Extract one shared shell-out helper; delete 5 duplicate seams.
4. Delete 3 assertXxxOnPath helpers (execFileSync already throws ENOENT).
5. Delete _setXxxPresentForTesting boolean flags + assertXxxOnPath bodies.
6. Inline splitLabeled at its 2 call sites.
7. Extract one shared extractSection helper; deduplicate across launcher/validate-spec/decompose.
8. Inline STUB_DEPS in the one test that uses it; delete from types.ts.
9. Delete scanForPaneId + PANE_ID_RE.
10. Drop unused workspaceId param from findPane.
11. Delete unused pane.ts exports (readPane, closePane, splitPane, renamePane, ReadPaneOpts) + their tests.
12. Delete trailer.ts (zero production callers).
13. Delete _setListPanesForTesting/_resetListPanes in launcher.ts.
14. Drop unused default params in beanIdFromBranch and branchFor.
15. Inline AgentPaneInfo interface.

## Acceptance Criteria

- [ ] All 15 items resolved
- [ ] Build + lint clean
- [ ] All tests pass (updated as needed)

## Test Plan

bun run build && bun run test && bun run lint after all changes.
