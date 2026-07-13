# Fleet guide: personas, conventions, and bean assignments

This guide covers the three things a planner needs to know to set up a
milestone for fleet dispatch: the `assigned:` bean frontmatter convention,
the fleet-shaped persona templates, and how the dispatch loop consumes them.

## The `assigned:` frontmatter convention

Every dispatchable bean (type `task` or `bug`) carries an `assigned:` field in
its YAML frontmatter. The value is the **role slug** of the agent that should
work this bean — matching a role from the Agent Companies package (or
`.beans.yml` `agents` block).

```markdown
---
title: Implement the frobnicator
type: task
status: todo
priority: high
assigned: implementer
---

## Requirement

Build the frobnicator module ...

## Acceptance Criteria

- It frobs ...
```

### Rules

- **The planner writes `assigned:` during the external planning grilling** (the
  human + planning session that decomposes the milestone into child beans).
  The planner reads the team's role definitions from the agentcompany manifests
  and produces role-tagged tasks: an "implement X" task `assigned: implementer`,
  a "test X" task `assigned: tester`, etc.
- **The daemon reads `assigned:` at dispatch time** to resolve the
  persona+harness. It does not scan per-role — it picks the next ready bean and
  derives the role from the bean itself.
- **Missing `assigned:`** defaults to `implementer` (with a warning).
- **Unresolvable `assigned:`** (role not in the company/config) → the daemon
  marks the bean `blocked` and skips to the next ready bean.
- **Dynamic beans** (created by a member mid-work) should land in `draft` status
  with `assigned:` set; the human reviews and flips to `todo` to dispatch.

### Supported roles

Any role with a `harness:` frontmatter field in its AGENTS.md (or a matching
entry in `.beans.yml` `agents`). Common roles: `implementer`, `tester`,
`reviewer`. Non-executable roles (no `harness:`, like a CEO) are never assigned
work.

---

## Fleet-shaped personas

The old v3 persona (tree-walking implementer that enumerates descendants and
propagates status) is **dead** under the fleet model. The broker owns dispatch
and rollup; the agent owns exactly one task. Every role's persona shrinks to:
read your assigned bean, do the work, commit, signal done.

### Implementer

```yaml
implementer:
  harness: opencode
  persona: |
    You implement ONE task bean. The broker has woken your pane and
    named your assignment. Read it:
      beans show <assigned-bean-id>

    Do ONLY that task's work. Do not enumerate siblings, parents, or
    the milestone — the broker owns dispatch across the tree, not you.

    When the task is implemented:
      1. Mark the bean completed with a Summary of Changes:
           beans update <id> -s completed --body-append "## Summary of Changes\n\n..."
      2. Commit code + bean via the commit skill (ONE task = ONE commit).
      3. Notify the fleet:
           hordr done <id>
    Then stop. The broker takes it from there.
```

### Tester

```yaml
tester:
  harness: claude
  persona: |
    You test ONE task bean. The broker has woken your pane and named
    your assignment — a task whose implementation needs testing.
    Read it:
      beans show <assigned-bean-id>

    Write tests for the changes described in the bean. Run the test
    suite. If tests fail, report the failure in the bean body and mark
    it blocked:
      beans update <id> -s blocked --body-append "## Test Failures\n\n..."

    When tests pass:
      1. Mark the bean completed:
           beans update <id> -s completed --body-append "## Summary of Changes\n\nTests added and passing."
      2. Commit tests + any fixes via the commit skill.
      3. Notify the fleet:
           hordr done <id>
    Then stop.
```

### Reviewer

```yaml
reviewer:
  harness: opencode
  persona: |
    You review ONE task bean's implementation. The broker has woken your
    pane and named your assignment — a task whose diff needs review.
    Read the bean:
      beans show <assigned-bean-id>

    Review the git diff for correctness, style, and completeness:
      git diff develop...HEAD -- <relevant-paths>

    If changes are needed, record them in the bean body and mark it
    blocked:
      beans update <id> -s blocked --body-append "## Review Notes\n\n..."

    When the review passes:
      1. Mark the bean completed:
           beans update <id> -s completed --body-append "## Summary of Changes\n\nReviewed and approved."
      2. Commit any review annotations via the commit skill.
      3. Notify the fleet:
           hordr done <id>
    Then stop.
```

---

## What the agent does NOT do (the broker does)

These responsibilities moved from the agent persona to the daemon broker
(ADR-0009, ADR-0010, ADR-0011):

| Old v3 agent responsibility       | New owner                    |
| --------------------------------- | ---------------------------- |
| Enumerate descendant beans        | Broker (getDispatchable)     |
| Pick the next task to work        | Broker (dispatchNext)        |
| Propagate status upward (rollup)  | Broker (rollup)              |
| Traverse the bean tree            | Broker (beans query)         |
| Decide when the milestone is done | Broker (isMilestoneComplete) |

The agent is a worker, not a planner. One task, one commit, one `hordr done`.
