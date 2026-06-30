---
# hordr-0qxy
title: 'Company context: env-var project resolution + chdir + persona override'
status: completed
type: task
priority: high
created_at: 2026-06-30T07:13:46Z
updated_at: 2026-06-30T07:26:31Z
parent: hordr-kgez
---

## Requirement

When `HORDR_COMPANY` and `HORDR_PROJECT` env vars are set, hordr resolves the project working directory from `projects/<slug>/PROJECT.md` frontmatter `path:` field, `process.chdir()`s there, and overrides agent personas from `agents/<role>/AGENTS.md` bodies with inlined `skills/<slug>/SKILL.md` content. This is the single integration seam — `loadConfig()` calls `getCompanyContext()` (lazy, memoized) which performs the chdir, then applies persona overrides to the loaded config.

## Spec

In `src/company.ts`:

- `resolveCompanyContext(companyPath, projectSlug): CompanyContext` — reads `projects/<slug>/PROJECT.md`, validates `path` exists.
- `getCompanyContext(): CompanyContext | null` — reads `HORDR_COMPANY`/`HORDR_PROJECT` env vars, memoizes result, performs `process.chdir(projectPath)` on first call. Returns null when env vars unset (backward compat).
- `applyAgentOverrides(config, ctx): HordrConfig` — for each role in `config.agents`, if `agents/<role>/AGENTS.md` exists in the company package, replace the persona with: AGENTS.md body + inlined skill bodies (from `skills:<slug>` frontmatter list). `.beans.yml` persona is the fallback when no AGENTS.md exists for a role.

In `src/config/loader.ts`:

- `loadConfig()` calls `getCompanyContext()` before searching for `.beans.yml` (so chdir happens first).
- After parsing config, if context is active, returns `applyAgentOverrides(config, ctx)`.

No changes to commands, harness/launcher, or any other module. `buildPrompt` already reads `config.agents[role].persona` — overrides flow through automatically.

## Acceptance Criteria

- [ ] `HORDR_COMPANY` + `HORDR_PROJECT` unset → current behavior unchanged (backward compat)
- [ ] Env vars set → `process.chdir()` to project path before `.beans.yml` search
- [ ] Agent personas overridden from `agents/<role>/AGENTS.md` body when file exists
- [ ] Skills from AGENTS.md frontmatter inlined into persona text
- [ ] `.beans.yml` persona used as fallback when no AGENTS.md for a role
- [ ] Missing `PROJECT.md` → clear error
- [ ] Missing `path:` in PROJECT.md frontmatter → clear error
- [ ] Missing skill file referenced by AGENTS.md → clear error

## Test Plan

Unit tests with temp dirs: create fake company package (COMPANY.md, agents/role/AGENTS.md, skills/slug/SKILL.md, projects/slug/PROJECT.md), set env vars, call loadConfig, assert chdir happened + persona overridden. Backward compat: no env vars → no chdir, no override.



## Summary of Changes

- Modified: `src/config/loader.ts` — loadConfig() now calls getCompanyContext() (lazy chdir) + applyAgentOverrides() when company context is active. Single integration seam — zero command or harness changes needed.
- Pre-existing lint fixes: removed dead `plan_workflow` references from test/config/schema.test.ts and test/harness/launcher.test.ts (leftover from planner purge 7e4b92f).
- All 32 tests in company + config + harness suites pass. Typecheck clean. Lint clean on changed files.
