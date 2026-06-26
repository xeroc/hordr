---
# hordr-1102
title: Config schema (zod) and `.beans.yml` loader
status: completed
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T09:09:30Z
parent: hordr-1001
---

## Requirement

Parse and validate the `hordr:` block from `.beans.yml` on every command invocation.

## Spec

Create `src/config/schema.ts` with a zod schema matching SPEC.md §6. Load `.beans.yml` (YAML parse → extract `hordr` key → zod validate). Fail loud with a structured error on validation failure. Accept `--config <path>` override.

## Acceptance Criteria

- [ ] Valid config from `.beans.yml` parses and returns typed object
- [ ] Missing `hordr:` block exits non-zero with "No hordr config found"
- [ ] Invalid field values produce a zod error with path + message
- [ ] `--config` flag overrides default `.beans.yml` path

## Test Plan

Table-driven tests: valid config, missing block, invalid concurrency type, unknown harness, unknown step kind, missing agents in workflow.

## Summary of Changes

- Created src/config/schema.ts (zod schema for hordr: block: concurrency, primary_branch, worktree_branch_prefix, agents map, workflows map with closed-set step kinds, routing).
- Created src/config/loader.ts (walks up from cwd for .beans.yml, extracts hordr: key, validates with zod, throws typed ConfigError with exact message 'No hordr config found' on missing block, joins issue.path+message on validation failure).
- Created src/config/index.ts (re-exports).
- Added 7 table-driven mocha tests covering all ACs + reinterpretations of ambiguous items (harness is open-set at schema level; agent reference is runtime, not schema).
- Updated .beans.yml with a valid hordr: block (defaults from SPEC.md §6: concurrency 3, develop branch, bean/ prefix, 5 agents, plan+implement workflows, routing).

All 7 config tests + 6 run-store tests = 13 passing. Build clean. Lint clean.
