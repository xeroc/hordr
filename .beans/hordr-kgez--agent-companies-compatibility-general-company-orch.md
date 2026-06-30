---
# hordr-kgez
title: Agent Companies compatibility + general company orchestration
status: in-progress
type: epic
priority: high
created_at: 2026-06-30T06:53:43Z
updated_at: 2026-06-30T07:26:31Z
---

## Requirement

Hordr should (a) be compatible with the [Agent Companies](https://agentcompanies.io/) vendor-neutral package format, and (b) evolve from a coding-agent-only orchestrator into a general company orchestrator. Coding-only is the current state, not the destination. Strategic intent: use hordr to manage a whole company.

## Spec

Agent Companies and hordr sit on complementary layers:

- Agent Companies = markdown-first **serialization/packaging** format for an org (COMPANY, TEAM, AGENTS, PROJECT, TASK, SKILL manifests)
- Hordr = **runtime/executor** (state machine spawning agents through workflows)

Hordr's ADR-0011 (domain behavior in persona text, engine domain-agnostic) is the design choice that makes the integration clean. Both projects share the same principle: _describe the org in markdown, keep the runtime generic._

### Mapping (engineering-relevant subset)

| Agent Companies                   | Hordr today                                 | Plan                                                                |
| --------------------------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| `agents/<role>/AGENTS.md` body    | `hordr.agents.<role>.persona` (inline YAML) | Body IS the persona - load from file.                               |
| `AGENTS.md` frontmatter `skills:` | (informal references in persona)            | Resolve shortnames, inline `SKILL.md` bodies into persona at spawn. |
| `PROJECT.md`                      | epic bean (body = spec)                     | Future: `hordr seed` / `hordr import`.                              |
| `TASK.md`                         | task bean (4-section body)                  | Future: same import command.                                        |
| `COMPANY.md`                      | top of `.beans.yml` `[hordr]`               | Org-level defaults. Minimal.                                        |
| `TEAM.md`                         | (nothing)                                   | **Deferred** - see child bean.                                      |
| `TASK.md` `schedule:`             | (nothing; SPEC §9 non-goal)                 | **Deferred** - see child bean.                                      |
| `SKILL.md`                        | (nothing formal)                            | Untouched - Agent Companies forbids redefining.                     |

### Long arc

Move from "coding-agent orchestrator" to "company orchestrator." Coding workflows become one specialization among many. The engine vocabulary (agent + hitl step kinds, ADR-0011) already supports this - the change is in personas, workflows, and the package format hordr consumes, not in engine code.

## Decisions

_no ADRs yet._ Source: exploration session 2026-06-30 against https://agentcompanies.io/specification.md and hordr SPEC.md.

## Decomposition

- [ ] hordr-7f2l - TEAM.md support: org subtrees & manager relationships (deferred)
- [x] hordr-ty9s - Company manifest parser
- [x] hordr-0qxy - Company context: env-var project resolution + chdir + persona override
- [ ] hordr-c4br - TASK.md scheduler: time-based task activation (deferred)
- [ ] _(Tier 1 active work - loader: persona from AGENTS.md, skill inlining - to be scoped when we start.)_

## Acceptance Criteria

- [ ] A hordr project can declare its agents/skills via an Agent Companies package on disk, and hordr loads personas from there instead of inline `.beans.yml`.
- [ ] `SKILL.md` attachments resolved and inlined into personas at spawn.
- [ ] Round-trip: the same package ingestible by another Agent Companies runtime (Paperclip, etc.) without hordr-specific edits.
- [ ] Non-coding workflows (research, review, ops) runnable end-to-end via the same engine.

## Test Plan

Integration: spin up a minimal Agent Companies package (COMPANY + 1 AGENTS + 1 SKILL + 1 PROJECT + 1 TASK), point hordr at it, verify persona = AGENTS.md body + inlined skill body, verify workflow runs to completion. Portability: ingest the same package with a non-hordr runtime.
