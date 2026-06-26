---
# hordr-1202
title: Bean body validator (4 required sections)
status: completed
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T09:29:24Z
parent: hordr-1002
---

## Requirement

Before a bean can leave the HITL gate, its body must contain all four sections with non-empty content.

## Spec

Create `src/beans/validate-spec.ts`. Parse the body for `## Requirement`, `## Spec`, `## Acceptance Criteria`, `## Test Plan` headers. Each section must exist and have at least one non-whitespace line after the header. Return `{valid: boolean, missing: string[], empty: string[]}`.

## Acceptance Criteria

- [ ] Body with all 4 sections and content → `{valid: true}`
- [ ] Missing section → reported in `missing[]`
- [ ] Section header present but body empty → reported in `empty[]`
- [ ] Acceptance Criteria requires at least one `- [ ]` checkbox

## Test Plan

Table-driven: complete body, each section missing individually, each section empty individually, no AC checkboxes, extra sections ignored.

## Summary of Changes

- src/beans/validate-spec.ts: pure function validateSpec(body) returning {valid, missing, empty}.
- Scans for exact-match (case-sensitive, trimmed) headers: ## Requirement, ## Spec, ## Acceptance Criteria, ## Test Plan.
- ## Acceptance Criteria additionally requires at least one '- [ ]' checkbox line (/^\s*- \[ \]\s*\S/).
- Section content runs until the next ## header or EOF.
- 12 table-driven tests: complete body, each section missing individually (4), each empty individually (4), AC-without-checkbox, extra sections ignored, blank-line tolerance.
