---
# hordr-ty9s
title: Company manifest parser (AGENTS/PROJECT/SKILL/COMPANY.md)
status: completed
type: task
priority: high
created_at: 2026-06-30T07:13:46Z
updated_at: 2026-06-30T07:26:30Z
parent: hordr-kgez
---

## Requirement

Parse Agent Companies markdown manifests (AGENTS.md, PROJECT.md, SKILL.md, COMPANY.md) into typed structures. Each manifest has optional YAML frontmatter and a markdown body. Pure parsing, no side effects — the foundation for company context resolution and persona overrides.

## Spec

New module `src/company.ts` with:

- `parseFrontmatter(content: string): {frontmatter: Record<string, unknown>, body: string}` — splits `---\n...\n---\n` from the body. Returns `({frontmatter: {}, body: content})` when no frontmatter.
- `parseAgentManifest(raw): {name, slug?, skills?: string[], reportsTo?: string|null, body: string}` — AGENTS.md body IS the persona text.
- `parseProjectManifest(raw): {name, slug?, path: string, body: string}` — `path` field is the working directory.
- `parseSkillManifest(raw): {name, slug?, body: string}` — body is the skill content to inline.
- `parseCompanyManifest(raw): {name, slug?, body: string}` — minimal.

Uses existing `yaml` package for frontmatter parsing. No new deps.

## Acceptance Criteria

- [ ] parseFrontmatter extracts YAML frontmatter delimited by `---` lines
- [ ] parseFrontmatter returns full content as body when no frontmatter present
- [ ] parseAgentManifest extracts `skills` array and `name` from frontmatter, body after
- [ ] parseProjectManifest extracts `path` field (the project working directory)
- [ ] parseSkillManifest extracts body (the skill content to inline)
- [ ] All parsers handle missing optional fields gracefully

## Test Plan

Unit tests with inline markdown strings. Test: valid frontmatter, no frontmatter, missing optional fields, multi-line body preservation.



## Summary of Changes

- New module: `src/company.ts` — manifest parsers (parseFrontmatter, parseAgentManifest, parseProjectManifest, parseSkillManifest, parseCompanyManifest), CompanyContext resolution (resolveCompanyContext, getCompanyContext), persona override (applyAgentOverrides).
- New test: `test/company.test.ts` — 20 tests covering manifest parsing, context resolution, chdir, persona override, skill inlining.
- ADR-0015 written.
