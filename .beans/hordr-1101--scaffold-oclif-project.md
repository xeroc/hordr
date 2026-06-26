---
# hordr-1101
title: Scaffold OCLIF TypeScript project with `hordr` binary
status: completed
type: task
priority: high
created_at: 2026-06-26T00:00:00Z
updated_at: 2026-06-26T08:54:28Z
parent: hordr-1001
---

## Requirement

Generate the OCLIF project skeleton so `hordr` is a globally-installable binary with subcommand structure.

## Spec

Use the `oclif-scaffolder` skill. Create the project at the repo root. Binary name: `hordr`. TypeScript. Add `zod` as a dependency. Stub command classes for every command in SPEC.md §5 (empty implementations that print "not implemented").

## Acceptance Criteria

- [x] `npm install -g .` installs the `hordr` binary
- [x] `hordr --version` works
- [x] `hordr --help` lists all subcommands
- [x] `hordr <command> --help` works for each stubbed command

## Test Plan

Install globally, run `--help`, verify all commands from SPEC.md §5 are present.

## Summary of Changes

- Scaffolded OCLIF ESM TypeScript project at repo root (bin/run.js, bin/dev.js, src/index.ts).
- Replaced pnpm with bun for installs/builds; kept mocha for the test runner via `bun run test`.
- Dropped @oclif/plugin-plugins (not needed in v1). Kept @oclif/plugin-help.
- Added 13 command stubs matching SPEC.md §5 + §7: plan, validate-spec, approve, run, advance, supervise, take, status, drain, reset, close-merged, on-worktree-created, on-worktree-removed.
- Each stub errors with exit code 2 (EUSAGE) so unimplemented commands fail loudly.
- Added zod + yaml deps for upcoming config/state work (hordr-1102, hordr-1103).
- `bun run build` compiles cleanly; `./bin/dev.js --help` lists all 13 commands.
