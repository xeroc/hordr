---
# hordr-1001
title: Scaffold OCLIF project, config schema, and state I/O
status: completed
type: epic
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T09:09:47Z
---

Bootstrap the hordr codebase: OCLIF project skeleton, `.beans.yml` config parsing with zod validation, and Run state file persistence under `$HERDR_PLUGIN_STATE_DIR`.

## Requirement

No code exists yet. We need a compilable, testable TypeScript project that can parse configuration and read/write Run state before any workflow logic can be built.

## Spec

Use the `oclif-scaffolder` skill to generate the project. OCLIF produces a globally-installable `hordr` binary with subcommand structure. Add zod for config and state schema validation. The state store reads/writes `$HERDR_PLUGIN_STATE_DIR/<bean-id>.json`.

## Acceptance Criteria

- [x] hordr --version prints a version
- [x] hordr --help lists subcommands
- [x] Config schema validates the hordr: block from .beans.yml (hordr-1102)
- [x] Invalid config exits non-zero with a clear error (ConfigError with path+message)
- [x] State store can create, read, update, and delete a Run state file (hordr-1103)
- [x] State files are validated by zod on every read (hordr-1103)

## Test Plan

Unit test the zod schema against valid/invalid config fixtures. Unit test the state store round-trip (write → read → compare).

## Summary of Changes

Epic delivered via 3 child tasks:
- hordr-1101 (scaffold): OCLIF ESM TS project, bun-based, 13 command stubs (plan, validate-spec, approve, run, advance, supervise, take, status, drain, reset, close-merged, on-worktree-created, on-worktree-removed).
- hordr-1102 (config schema): zod schema for hordr: block, .beans.yml loader with upward search + --config override, 7 tests.
- hordr-1103 (state store): RunState zod schema, atomic putRun/getRun/deleteRun/listRuns against HERDR_PLUGIN_STATE_DIR, 6 tests.

All 13 tests passing. Build + lint clean. ./bin/dev.js --help lists all commands. Next: hordr-1002 (Beans CLI integration), hordr-1003 (Herdr CLI integration), then hordr-1004 (workflow engine).
