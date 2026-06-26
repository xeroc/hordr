---
# hordr-si47
title: Update SPEC.md
status: todo
type: task
priority: high
created_at: 2026-06-26T20:59:34Z
updated_at: 2026-06-26T20:59:34Z
parent: hordr-1t2j
---

## Requirement

SPEC-delta-planning.md has been implemented. Merge its changes into SPEC.md (the authoritative doc) and archive the delta file so there's one source of truth.

## Spec

Edit SPEC.md in place:

- §1 Overview: update the discovery → decompose → implement pipeline description.
- §2 Bean lifecycle: add the epic 6-section body contract; add the lifecycle table additions for epic decomposed/completed rows; document the children-skip-planning rule.
- §3 Run state machine: clarify Runs apply to task/bug only; add the "(none) → queued" entry path for decomposed children; update the state diagram.
- §5 CLI commands: add `hordr decompose` row; mark `validate-spec` as type-aware.
- §5 `decompose` contract: full preconditions/postconditions/idempotency spec (lift from delta).
- §6 Config: add the `planner` agent block.
- §8 Project layout: add `src/commands/decompose.ts`, `src/events/`, ADR directory mention.

Archive SPEC-delta-planning.md by either deleting it (its content is now in SPEC.md) or moving under `docs/archive/`. Ponytail: delete — git history preserves it if needed.

## Decisions

- [ADR-0008](docs/adr/0008-epic-bean-is-spec.md), [ADR-0009](docs/adr/0009-decompose-is-stateless.md), [ADR-0010](docs/adr/0010-children-skip-planning.md) (all accepted)

## Acceptance Criteria

- [ ] SPEC.md reflects the new planning & discovery model end-to-end
- [ ] SPEC-delta-planning.md removed (changes absorbed into SPEC.md)
- [ ] No content lost (cross-check delta sections vs. new SPEC.md sections)
- [ ] Version bump in SPEC.md header (Draft v1 → Draft v2)

## Test Plan

Manual: read the new SPEC.md end-to-end, verify each delta section is represented. Diff check against delta file.
