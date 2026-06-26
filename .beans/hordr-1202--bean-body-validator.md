---
# hordr-1202
title: Bean body validator (4 required sections)
status: in-progress
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T09:14:09Z
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
