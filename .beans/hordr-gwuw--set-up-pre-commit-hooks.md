---
# hordr-gwuw
title: Set up pre-commit hooks
status: completed
type: task
priority: high
created_at: 2026-06-26T09:24:31Z
updated_at: 2026-06-26T09:27:59Z
---

Install pre-commit framework with minimal hooks tailored to this TS/oclif/bun repo: core hygiene, gitleaks, conventional-gitmoji commit lint, and local bun run lint/typecheck (pre-commit) + test (pre-push). Add typecheck script, CI workflow, install hooks, verify.

## Summary of Changes

- Added `typecheck` script (`tsc --noEmit`) to package.json.
- Created `.pre-commit-config.yaml` tailored to single-package TS/oclif/bun repo: core hygiene (pre-commit-hooks v5), gitleaks v8.21, cz-conventional-gitmoji, local hooks reusing `bun run lint`/`typecheck` (pre-commit) and `bun run test` (pre-push).
- Created `.github/workflows/pre-commit.yml` (bun + setup-python + pre-commit/action with `--all-files`).
- Installed hooks for pre-commit, pre-push, and commit-msg stages.
- Untracked `tsconfig.tsbuildinfo` (build artifact) and added it to `.gitignore` so the EOF hook stops thrashing.
- Verified: `pre-commit run --all-files` green on both pre-commit and pre-push stages.

Skipped (YAGNI): markdownlint (3 .md files, README auto-generated), prettier (no binary; eslint-config-prettier covers rule conflicts), monorepo path filters, Rust/Python/Go hooks.
