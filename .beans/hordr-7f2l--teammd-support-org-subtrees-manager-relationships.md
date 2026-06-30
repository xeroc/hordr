---
# hordr-7f2l
title: 'TEAM.md support: org subtrees & manager relationships'
status: todo
type: feature
priority: deferred
created_at: 2026-06-30T06:54:31Z
updated_at: 2026-06-30T06:54:31Z
parent: hordr-kgez
---

## Requirement

Agent Companies `TEAM.md` defines reusable org subtrees with manager relationships. Hordr v1 has no team/manager concept - roles are flat in `.beans.yml`. To support whole-company orchestration, hordr needs a first-class notion of teams (reporting lines, manager-coordinated workflows, subtree reuse).

Created as deferred tracking per 2026-06-30 strategy session: explicitly skipped for now, re-iterate when hordr approaches general-company orchestration.

## Spec

Deferred - will scope when we start. Likely involves:

- Loading `TEAM.md` manifests from a company package
- Mapping `manager:` and `includes:` fields to hordr's role/workflow model
- Possibly a manager role that delegates to team members (new step pattern?)

## Acceptance Criteria

- [ ] `TEAM.md` manifests load and resolve against `AGENTS.md` roles.
- [ ] Manager relationship observable in hordr (status, routing, or escalation).
- [ ] Round-trips with Agent Companies spec.

## Test Plan

TBD when scoped.
