---
# hordr-1002
title: Beans CLI integration
status: in-progress
type: epic
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T09:14:08Z
---

Wrap the `beans` CLI for status reads/writes, body reads, workflow field management, and spec validation.

## Requirement

Hordr must read and transition bean status and body via the `beans` CLI. It must not parse `.beans/` markdown files directly (the `beans` CLI is the authority). The body must be validated for the four required sections before leaving the HITL gate.

## Spec

Thin wrapper functions that shell out to `beans` and parse JSON output where available. Bean body section validation uses a simple section-header parse (not a full markdown AST). The `workflow:` frontmatter field is the only hordr-owned bean field.

## Acceptance Criteria

- [ ] Can read a bean's status and body via `beans` CLI
- [ ] Can transition status (todo → draft → todo → in-progress → completed)
- [ ] `validate-spec` checks for non-empty Requirement, Spec, Acceptance Criteria, Test Plan
- [ ] Can set and read the `workflow:` frontmatter field
- [ ] Commit trailer format helper returns `Refs: <prefix><id>`

## Test Plan

Mock `beans` CLI calls in unit tests. Test validate-spec against beans with missing sections, empty sections, and complete sections.
