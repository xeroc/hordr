---
# hordr-1201
title: Beans CLI wrapper (status read/write, body read)
status: in-progress
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T09:14:08Z
parent: hordr-1002
---

## Requirement

Wrap the `beans` CLI for the operations hordr needs: read status, read body, set status, set frontmatter field.

## Spec

Create `src/beans/client.ts`. Functions: `getStatus(beanId)`, `getBody(beanId)`, `setStatus(beanId, status)`, `setWorkflow(beanId, workflow)`, `getBean(beanId)` (full read). Shell out to `beans` CLI. Parse JSON output (`--json` flag if available, else parse text). Never write bean files directly.

## Acceptance Criteria

- [ ] `getStatus` returns one of: todo, draft, in-progress, completed, scrapped
- [ ] `getBody` returns the markdown body text
- [ ] `setStatus` transitions and returns the new status
- [ ] `setWorkflow` writes the `workflow:` frontmatter field
- [ ] All functions fail loud if `beans` is not on PATH

## Test Plan

Mock `beans` CLI invocations. Test each function against known bean fixtures.
