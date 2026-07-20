---
# hordr-qfx3
title: 'code hygiene: delete unused exports + dead barrels + half-implemented provenance'
status: todo
type: task
priority: low
created_at: 2026-07-20T09:03:08Z
updated_at: 2026-07-20T09:03:08Z
---

## Context

Dead-code scan after the 2026-07 engine.ts ports. Findings from `npx ts-prune` plus manual verification. Each item is small and surgical — one task is enough.

## Findings (verify each before deleting — ts-prune has false positives for test seams)

### True dead code (delete)

- [ ] `src/storage/fleets.ts:178` — `getLane(db, epicId)` — test-only (`test/fleet/lifecycle.test.ts:9`). Replace callers with `listLanes(...).find(l => l.epicBeanId === id)`, then delete.
- [ ] `src/storage/fleets.ts:240-296` — provenance helpers `recordProvenance`, `listProvenance`, `provenanceFor` — half-implemented ADR-0013 feature: storage + helpers exist, no production caller ever records. Either wire it (record on every spawn) or delete the helpers + the `bean_provenance` table from `src/storage/db.ts`. Recommendation: delete — provenance is a forensic nice-to-have that has shipped zero value; if needed later it is small to re-add.
- [ ] `src/beans/index.ts` — barrel file, zero importers. Delete.
- [ ] `src/harness/index.ts` — barrel file, zero importers. Delete.
- [ ] `src/config/index.ts` — barrel file, one test importer (`test/config/schema.test.ts:7`). Inline the import to point directly at `src/config/loader.js` + `src/config/schema.js`, then delete the barrel.
- [ ] `src/company.ts:105` — `parseCompanyManifest(raw)` — exported but only used in `test/company.test.ts`. Either tighten to non-exported, or delete if company manifest parsing is truly unused in production. Verify first.

### Already tracked separately

- `src/dispatch/tick.ts` + `src/dispatch/advance.ts` + `test/helpers/fleet-engine.ts` — see bean hordr-nrpe.

### False positives (DO NOT delete)

- All `_setXForTesting` / `_resetX` test seams — used by tests; ts-prune doesn't see test imports.
- `src/commands/*/default` exports — oclif auto-discovers command classes via `dist/commands/`.
- All `src/beans/index.ts` re-exports if they're part of a published API surface (verify before deletion).

## Acceptance Criteria

- [ ] Each "true dead code" item above is either deleted or explicitly justified in the bean body
- [ ] `bun run lint` clean
- [ ] `bun run typecheck` clean
- [ ] `bun run test` passes (count may drop by deleted-test-only coverage)
- [ ] `npx ts-prune` re-run shows only test seams + command defaults
