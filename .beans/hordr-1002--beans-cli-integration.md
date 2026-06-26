---
# hordr-1002
title: Beans CLI integration
status: completed
type: epic
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T09:30:06Z
---

Wrap the `beans` CLI for status reads/writes, body reads, workflow field management, and spec validation.

## Requirement

Hordr must read and transition bean status and body via the `beans` CLI. It must not parse `.beans/` markdown files directly (the `beans` CLI is the authority). The body must be validated for the four required sections before leaving the HITL gate.

## Spec

Thin wrapper functions that shell out to `beans` and parse JSON output where available. Bean body section validation uses a simple section-header parse (not a full markdown AST). The `workflow:` frontmatter field is the only hordr-owned bean field.

## Acceptance Criteria

- [x] Can read a bean's status and body via beans CLI (hordr-1201: getBean/getStatus/getBody)
- [x] Can transition status (setStatus validates + returns new status) (hordr-1201)
- [x] validate-spec checks 4 sections non-empty, AC requires a checkbox (hordr-1202)
- [x] workflow assignment persists as body marker <!-- hordr:workflow=X --> via beans update (beans CLI has no frontmatter setter; documented reinterpretation) (hordr-1201)
- [x] Commit trailer + PR title helpers (hordr-1203)

## Test Plan

Mock `beans` CLI calls in unit tests. Test validate-spec against beans with missing sections, empty sections, and complete sections.
