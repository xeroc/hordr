# SPEC.md Delta — Planning & Discovery Model

> **Status:** Proposed — 2026-06-26
> **Applies to:** SPEC.md v1 (Draft, 2026-06-26)
> **Action:** Refactor into SPEC.md after current implementation stabilizes.
> Do NOT edit SPEC.md directly — another agent is implementing from it.

---

## Premise

Discovery (spec + ADR authoring) lives **outside** hordr. A skill (the main
harness) working on `develop` produces:

1. An **epic bean** whose body IS the spec.
2. **ADR files** in `docs/adr/`.

Hordr's planning role is one command: `decompose`. It reads the epic + ADRs,
creates child task beans, and each child enters the existing implementation
workflow with its own worktree.

**Principle:** the bean IS the spec. No parallel document hierarchy. ADRs are
the only files — because they're cross-cutting project memory, not per-unit
work items.

---

## End-to-end flow

```
 ┌─────────────────────────────────────────────────────┐
 │  DISCOVERY (outside hordr — skill on develop)       │
 │                                                     │
 │  human + LLM discuss problem, explore edges         │
 │  → write ADRs to docs/adr/NNNN-*.md (on develop)    │
 │  → create epic bean (body = spec + decision refs)   │
 │                                                     │
 │  git commit on develop: + docs/adr/, + .beans/epic  │
 └──────────────────────┬──────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────┐
 │  DECOMPOSE (hordr — on develop, no worktree)        │
 │                                                     │
 │  hordr decompose <epic>                             │
 │  → planner pane reads epic body + ADRs              │
 │  → creates N child task beans (--parent <epic>)     │
 │  → fills epic's ## Decomposition section            │
 │  → epic → completed                                 │
 └──────────────────────┬──────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────┐
 │  IMPLEMENTATION (hordr — per child, worktree)       │
 │                                                     │
 │  hordr run <child>   (or hordr drain)               │
 │  → worktree: bean/<child-id>                        │
 │  → implement → test → review → commit → pr          │
 │  → child → in-progress                              │
 └──────────────────────┬──────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────┐
 │  FINALIZE (human + hordr)                           │
 │                                                     │
 │  human reviews PRs, merges on GitHub                │
 │  hordr close-merged                                 │
 │  → child → completed, worktree removed              │
 └─────────────────────────────────────────────────────┘
```

Key: **discovery and decomposition happen on `develop`.** Only implementation
spins off worktrees. This means ADRs and specs are on develop before any agent
touches code — downstream worktrees (branched from develop) inherit them for
free.

---

## §2 Bean lifecycle — modified

### Epic body contract (new)

Epics use a 6-section body. Tasks/bugs keep the existing 4-section contract
(unchanged).

```markdown
## Requirement

<problem statement — why this epic exists>

## Spec

<full technical spec — scope, user journeys, key flows, constraints.
This IS the spec document. There is no separate specs/ file.>

## Decisions

- [ADR-0007](docs/adr/0007-postgresql.md) — PostgreSQL for durable queue (accepted)
- [ADR-0008](docs/adr/0008-concurrency-model.md) — Token-bucket rate limiter (accepted)

## Decomposition

<!-- filled by hordr decompose; empty until decomposition runs -->

- [ ] bean-id — Child title
- [ ] bean-id — Child title

## Acceptance Criteria

- [ ] <epic-level criterion — integration / end-to-end>

## Test Plan

<integration / E2E verification strategy for the epic as a whole>
```

`hordr validate-spec <bean>` becomes type-aware:

| Bean type     | Required sections                                                           |
| ------------- | --------------------------------------------------------------------------- |
| `epic`        | Requirement, Spec, Decisions, Decomposition, Acceptance Criteria, Test Plan |
| `task`, `bug` | Requirement, Spec, Acceptance Criteria, Test Plan (unchanged)               |

Decisions section may be empty for trivial epics — but the section header must
exist.

### Lifecycle table additions

| Bean status | Type | Body                               | Run state            | What it means                                                            |
| ----------- | ---- | ---------------------------------- | -------------------- | ------------------------------------------------------------------------ |
| `todo`      | epic | spec complete, Decomposition empty | _(none)_             | Created by discovery skill. Ready for `hordr decompose`.                 |
| `completed` | epic | spec + Decomposition filled        | _(none)_             | Decomposed into children. Epic's job is done.                            |
| `todo`      | task | full 4-section                     | _(none)_ or `queued` | Child of an epic (or standalone). Ready for `hordr run`. Skips planning. |

**Decomposed children skip the planning phase entirely.** No `draft-spec`
step, no `awaiting-approval` Run state. The epic's discovery was the planning.
Children enter at `queued` when `hordr run <child>` is called, because their
bodies are already complete.

Standalone tasks (not from decomposition) still go through `hordr plan` →
`draft-spec` → `awaiting-approval` → `queued` as today.

---

## §3 Run state machine — modified

### Runs are implementation-only

The Run state machine (§3) applies to **task/bug beans only**. Epic beans
never have a Run — `hordr decompose` is a **stateless command**, not a Run.

### Decomposed children enter at queued

Current entry path (standalone tasks via `hordr plan`):

```
(none) → planning → awaiting-approval → queued → running → ...
```

New entry path (decomposed children via `hordr run`):

```
(none) → queued → running → ...
```

`hordr run <child>` creates the Run directly in `queued` state, skipping
`planning` and `awaiting-approval`. The body is already complete (filled by
decompose).

### Updated state diagram

```
                     hordr plan                  hordr decompose
                      (task)                       (epic)
  (none) ──────────────────────► planning          │
                                     │              │ creates children
                                     │              │ (todo, full body)
                                     ▼              │
                           awaiting-approval        │
                                     │              ▼
                              hordr approve    ┌──────────┐
                                     │         │  child   │ ← todo, body complete
                          ┌────────────┘         │ (no Run) │
                          ▼                      └────┬─────┘
                       queued ◄───────────────────────┘
                          │                        hordr run <child>
                   hordr drain / run               (creates Run at queued)
                          │
                          ▼
                       running
                          │
                    implement → test → review
                          → commit → pr
                          │           │
                   any step │           │ close-merged
                   can block│           ▼
                          ▼         closed
                       blocked
                          │
               hordr take / hordr reset
                          │
                          ▼
           running (resume) / (none)
```

---

## §4 Step kinds — unchanged

The closed set of 8 step kinds (§4) does **not** change. `decompose` is a CLI
command, not a step kind. It spawns an agent pane (like `draft-spec` does) but
is not part of any workflow's step sequence. The implementer agent for child
tasks inherits spec/ADR context via persona text and file reads, not via new
step kinds.

---

## §5 CLI commands — additions

| Command                      | Description                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hordr decompose <epic>`     | Validate epic body. Spawn planner pane on `develop` (no worktree). Planner reads epic spec + ADRs, creates child task beans via `beans create --parent <epic-id>`. Fill epic's `## Decomposition` section. Epic → `completed`. |
| `hordr validate-spec <bean>` | **Modified:** dispatch on bean type. Epics: 6 sections. Tasks/bugs: 4 sections. Exit 0 if valid, 1 if not.                                                                                                                     |

### `hordr decompose` — contract

**Preconditions:**

- Bean type is `epic`.
- Bean status is `todo`.
- Body passes `validate-spec` for epic contract (all 6 sections present).
- Decomposition section is empty (no children yet).

**Execution:**

1. Spawn planner pane on `develop` (no worktree). Label: `hordr:<epic-id>:planner`.
2. Inject persona (see §6). Planner reads:
   - Epic bean body (full spec).
   - Every ADR listed in `## Decisions` (`docs/adr/NNNN-*.md`).
3. Planner creates child beans via `beans create "<title>" -t task --parent <epic-id>`.
   Each child body gets:
   - **Requirement:** scoped to this child's piece of the epic.
   - **Spec:** technical approach, citing parent epic + relevant ADRs.
   - **Acceptance Criteria:** testable, scoped to this child.
   - **Test Plan:** verification for this child's scope.
   - Frontmatter: `workflow:` set from routing config (default: `routing.default_workflow`).
4. Planner writes child list into epic's `## Decomposition` section.
5. Epic → `completed`.

**Postconditions:**

- N child beans exist with status `todo`, parent `<epic-id>`, complete bodies.
- Epic status `completed`, Decomposition section lists all children.
- Planner pane closed.

**Idempotency:**

- If epic already has children (Decomposition non-empty) → warn, exit.
- If pane `hordr:<epic-id>:planner` is alive → reuse, don't re-spawn.
- If pane died mid-decompose → re-run. Planner checks existing children before
  creating new ones (reads Decomposition section + `beans list --parent`).

### `hordr validate-spec` — modified

```
dispatch on bean type:
  epic  → check 6 sections (Requirement, Spec, Decisions, Decomposition, AC, Test Plan)
  task  → check 4 sections (Requirement, Spec, AC, Test Plan)  [unchanged]
  bug   → check 4 sections [unchanged]
```

For epics, Decisions section may have empty content (trivial epic with no
ADRs) but the header must exist. Decomposition may be empty (not yet
decomposed) but the header must exist.

---

## §6 Configuration schema — additions

```yaml
hordr:
  concurrency: 3
  primary_branch: develop
  worktree_branch_prefix: bean/

  agents:
    implementer:
      harness: opencode
      persona: |
        You implement a single task bean.
        If this bean has a parent epic, read it for full spec context:
        beans show <parent-id>
        Read ADRs cited in the parent or in this bean's Spec section.
        Implement only this task's scope. Do not re-decide architecture.

    tester:
      harness: opencode
      persona: '...'

    reviewer:
      harness: opencode
      persona: '...'

    open_pr:
      harness: opencode
      persona: '...'

    planner: # NEW — used by hordr decompose
      harness: opencode
      persona: |
        You decompose an epic into independently implementable task beans.

        Read the epic bean body for the full spec:
        beans show <epic-id>

        Read every ADR listed in ## Decisions:
        docs/adr/NNNN-*.md

        For each child, create a task bean:
        beans create "<title>" -t task --parent <epic-id>

        Then fill each child's body with:
        - Requirement: scoped to this child's piece
        - Spec: technical approach, citing parent + relevant ADRs
        - Acceptance Criteria: testable, scoped
        - Test Plan: verification for this scope

        Set workflow frontmatter from routing.

        Each child MUST be independently runnable — no hidden cross-dependencies
        within the epic. If a dependency exists, mark it explicitly:
        beans update <child> --blocked-by <sibling-id>

        Do NOT re-decide architecture. Cite the ADR.
        Do NOT write code. You create beans, not files.

        When done, list all children in the epic's ## Decomposition section:
        beans update <epic-id> --body-replace-old "## Decomposition" \
          --body-replace-new "## Decomposition\n\n- [ ] <child-id> — <title>\n..."

  workflows:
    implement:
      steps:
        - kind: implement
          agent: implementer
          pane: root
        - kind: test
          agent: tester
          pane: sibling
        - kind: review
          agent: reviewer
          optional: true
        - kind: commit
        - kind: pr
          agent: open_pr

  routing:
    default_workflow: implement
    # Epic beans are decomposed, not run — no workflow assignment.
    # Child beans inherit default_workflow unless overridden.
    # Standalone task beans use default_workflow via hordr plan.
```

---

## §8 Project layout — confirmed

```
hordr/
├── .beans.yml
├── .beans/
├── CONTEXT.md
├── SPEC.md
├── SPEC-delta-planning.md         # ← this file (temporary, refactored into SPEC.md)
├── docs/
│   └── adr/                        # ADRs live here (on develop, shared)
│       ├── 0001-*.md
│       └── ...
├── herdr-plugin.toml
├── package.json
├── src/
│   ├── commands/
│   │   ├── ... (existing)
│   │   ├── decompose.ts            # NEW
│   │   └── validate-spec.ts        # MODIFIED (type dispatch)
│   ├── beans/
│   │   └── client.ts               # may gain createChild / listChildren helpers
│   └── ...
└── test/
    └── decompose.test.ts           # NEW
```

**No `specs/` directory.** The spec lives in the epic bean body. Confirmed:
the only planning artifacts that are files (not beans) are ADRs.

---

## ADR format (reference — not enforced by hordr)

Discovery (external skill) writes ADRs to `docs/adr/NNNN-<slug>.md`:

```markdown
# ADR-NNNN: <Title>

## Status

accepted

## Context

<why this decision is needed>

## Decision

<what was decided>

## Consequences

<impact — positive and negative>

## Alternatives Considered

<what else was on the table and why it lost>
```

Hordr reads ADRs but never writes them. Only ADRs with status `accepted`
should be referenced in epic `## Decisions` sections. (Hordr does not enforce
ADR status in v1 — the discovery skill is responsible.)

---

## What this changes for the user

| Before                                                         | After                                                                                         |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| All beans are tasks. One workflow. Planning = fill 4 sections. | Beans have types. Epics hold specs. Tasks hold work.                                          |
| `hordr plan <task>` → fill body → approve → run                | Standalone tasks: unchanged. Epics: discovery skill → `hordr decompose` → `hordr run <child>` |
| Every Run gets a worktree                                      | Implementation Runs get worktrees. Decompose runs on develop (no worktree).                   |
| No ADR concept                                                 | ADRs in `docs/adr/`, referenced by epics. Agents read them for context.                       |
| Architecture re-decided per task                               | Architecture frozen in ADRs before implementation. Tasks cite, don't decide.                  |

---

## Open questions (defer to refactor)

1. **Recursive decomposition** (epic → feature → task). v1: no. If a child is
   too big, human re-tags it as epic and decomposes again. The decompose
   command works on any `epic`-typed bean regardless of depth.

2. **Inter-child dependencies.** Planner can set `--blocked-by` on children.
   `hordr drain` already respects blocked beans. No new mechanism needed.

3. **ADR validation.** v1: none. Discovery skill owns ADR quality. Hordr reads
   files, doesn't parse status. Add `hordr validate-adr` later if needed.

4. **Epic as a bean type.** Beans already supports `epic` type. No format
   change needed — just the body contract.
