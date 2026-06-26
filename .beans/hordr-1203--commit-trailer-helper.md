---
# hordr-1203
title: Commit trailer format helper
status: in-progress
type: task
priority: medium
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T09:14:09Z
parent: hordr-1002
---

## Requirement

Produce the conventional-commit trailer for a bean id, read from `.beans.yml` prefix.

## Spec

Create `src/beans/trailer.ts`. Function: `commitTrailer(beanId)` → `Refs: <bean-id>`. Also `prTitle(beanId, subject)` → `<type>: <subject> (Refs: <bean-id>)`. The bean id already includes the prefix (e.g. `hordr-abcd`), so no prefix lookup needed — just use the id as-is.

## Acceptance Criteria

- [ ] `commitTrailer("hordr-abcd")` → `"Refs: hordr-abcd"`
- [ ] `prTitle("hordr-abcd", "add config loader")` → `"feat: add config loader (Refs: hordr-abcd)"`

## Test Plan

Pure function tests. Edge: empty id, id without prefix.
