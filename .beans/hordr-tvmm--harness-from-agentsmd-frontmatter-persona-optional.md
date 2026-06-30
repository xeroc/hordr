---
# hordr-tvmm
title: Harness from AGENTS.md frontmatter + persona optional in schema
status: completed
type: task
priority: high
created_at: 2026-06-30T08:58:25Z
updated_at: 2026-06-30T08:58:25Z
parent: hordr-kgez
---

## Requirement

Move `harness` from `.beans.yml` to AGENTS.md frontmatter. Make `persona` optional in schema (comes from AGENTS.md body when company is active). Runtime validation ensures every agent has a persona by end of loadConfig.

## Spec

- AgentDefSchema: persona changed from `z.string().min(1)` to `z.string().optional()`
- AgentManifest: added `harness?: string` field
- parseAgentManifest: extracts `harness` from frontmatter
- applyAgentOverrides: rewritten to scan `agents/*/` directories. Picks up roles with `harness:` in frontmatter (hordr-executable). Roles without harness are skipped (CEO/CTO types). New roles from company added to config. `.beans.yml` agents kept as fallback for roles not in company package.
- loadConfig: runtime validation — every agent must have persona by return time.

## Summary of Changes

- src/config/schema.ts: persona optional
- src/company.ts: harness in AgentManifest, directory scan in applyAgentOverrides
- src/config/loader.ts: runtime persona validation
- test/company.test.ts: harness tests, agent discovery tests, skip-without-harness test
- 35 tests passing, lint clean, typecheck clean

Concurrency and routing confirmed already optional (defaults: 3 and 'implement').
