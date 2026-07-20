---
# hordr-qfx3
title: 'code hygiene: delete unused exports + dead barrels + half-implemented provenance'
status: completed
type: task
priority: low
created_at: 2026-07-20T09:03:08Z
updated_at: 2026-07-20T09:29:10Z
---

## Context

Dead-code scan after the 2026-07 engine.ts ports. Findings from `npx ts-prune` plus manual verification. Each item is small and surgical — one task is enough.

## Findings (verify each before deleting — ts-prune has false positives for test seams)

### True dead code (delete)

- [x] `src/storage/fleets.ts:178` — `getLane(db, epicId)` — deleted. `test/fleet/lifecycle.test.ts` callers replaced with a local `laneByEpic()` helper that wraps `listLanes(db, PK, MS).find(...)`.
- [x] `src/storage/fleets.ts:240-296` — provenance helpers deleted along with the `bean_provenance` table from `src/storage/db.ts` and the 4 associated tests in `test/storage/{db,fleets}.test.ts`. Per recommendation: zero production callers, re-add small if needed.
- [x] `src/beans/index.ts` — deleted (zero importers).
- [x] `src/harness/index.ts` — deleted (zero importers).
- [x] `src/config/index.ts` — deleted. `test/config/schema.test.ts` import inlined to `../../src/config/loader.js`.
- [x] `src/company.ts:105` — `parseCompanyManifest` + `CompanyManifest` interface deleted. Verified zero production callers (only `parseProjectManifest` and `parseSkillManifest` are used in production). Test case removed.

### Already tracked separately

- `src/dispatch/tick.ts` + `src/dispatch/advance.ts` + `test/helpers/fleet-engine.ts` — see bean hordr-nrpe.

### False positives (DO NOT delete)

- All `_setXForTesting` / `_resetX` test seams — used by tests; ts-prune doesn't see test imports.
- `src/commands/*/default` exports — oclif auto-discovers command classes via `dist/commands/`.
- All `src/beans/index.ts` re-exports if they're part of a published API surface (verify before deletion).

## Acceptance Criteria

- [x] Each "true dead code" item above is either deleted or explicitly justified in the bean body
- [x] `bun run lint` clean (4 pre-existing warnings, no errors; unchanged by this task)
- [x] `bun run typecheck` clean
- [x] `bun run test` passes — 334 → 329 (−5: matches exactly the 5 deleted tests)
- [x] `npx ts-prune` re-run shows only test seams + command defaults (+ `tick`, tracked in hordr-nrpe)

## Summary of Changes

Deleted 6 dead-code items identified by ts-prune + manual verification:

- `getLane(db, epicId)` from `src/storage/fleets.ts` — test callers replaced with a local `laneByEpic()` helper.
- Provenance helpers (`recordProvenance`, `listProvenance`, `provenanceFor`, `ProvenanceRow`) from `src/storage/fleets.ts` + `bean_provenance` table from `src/storage/db.ts`. ADR-0013 feature never wired into production spawns.
- Barrel files: `src/beans/index.ts`, `src/harness/index.ts`, `src/config/index.ts` (last one's sole test importer inlined).
- `parseCompanyManifest` + `CompanyManifest` interface from `src/company.ts`.

Test impact: 334 → 329 passing (−5 = 2 provenance round-trip tests + 2 db bean_provenance tests + 1 parseCompanyManifest test).

Verification: `bun run lint`, `bun run typecheck`, `bun run test` all green. `npx ts-prune` output now limited to test seams, command defaults, and the separately-tracked legacy `tick` (hordr-nrpe).
