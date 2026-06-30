# ADR-0015: Agent Companies package support

> **Status:** Accepted
> **Date:** 2026-06-30

## Context

Hordr needs to be compatible with the [Agent Companies](https://agentcompanies.io/) vendor-neutral package format, and evolve from a coding-agent-only orchestrator toward general company orchestration. The company package (lives in e.g. an Obsidian vault) contains `AGENTS.md`, `PROJECT.md`, `SKILL.md` manifests. Multiple projects can coexist under one company, each pointing to a different code repository.

## Decision

Implement Agent Companies support via a **single integration seam**: `loadConfig()`.

### Mechanism

1. **Env-var-driven context.** `HORDR_COMPANY` (path to company package root) + `HORDR_PROJECT` (project slug). When both are set, `getCompanyContext()` resolves the project's working directory from `projects/<slug>/PROJECT.md` frontmatter `path:` field.

2. **Lazy chdir.** On first `loadConfig()` call, if company context is active, `process.chdir(projectPath)`. Memoized — subsequent calls are no-ops. This ensures `beans`, `herdr`, and `git` all operate in the project's code repo, not the company package directory.

3. **Persona override from AGENTS.md.** After loading `.beans.yml`, if company context is active, agent personas are overridden from `agents/<role>/AGENTS.md` bodies. Skills referenced in AGENTS.md frontmatter (`skills: [slug1, slug2]`) are inlined from `skills/<slug>/SKILL.md` and appended to the persona text. Roles without an AGENTS.md in the company package keep their `.beans.yml` persona (fallback).

4. **Zero command changes.** Every command and subsystem calls `loadConfig()`. The override flows through automatically to `buildPrompt()` which reads `config.agents[role].persona`.

### What we skip (deferred)

- `TEAM.md` — tracked in bean `hordr-7f2l`
- `TASK.md` scheduler — tracked in bean `hordr-c4br`
- CLI flags (`--company`, `--project`) — env vars suffice for v1

## Consequences

- Hordr can be driven from a company package in any location (e.g. Obsidian vault).
- Agent personas are now portable — the same AGENTS.md + SKILL.md files work across runtimes.
- The `process.chdir()` side effect in `getCompanyContext()` is a global mutation. It is lazy, memoized, and only fires when `HORDR_COMPANY` is set. Tests that don't set the env var are unaffected.
- `.beans.yml` personas become the fallback layer; company package AGENTS.md is the primary layer when a company is active.
