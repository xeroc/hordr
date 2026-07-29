---
# hordr-6wx7
title: 'Config: add kind + auto_approve fields to AgentDefSchema'
status: scrapped
type: task
priority: high
created_at: 2026-07-22T08:53:48Z
updated_at: 2026-07-28T10:43:16Z
parent: hordr-gdqm
---

## Requirement

Add `kind` and `auto_approve` fields to the agent config schema so the dispatch core can pass `--kind` to `agent start` and optionally auto-interact on `blocked` lifecycle.

## Changes

### `src/config/schema.ts`

```typescript
export const AgentDefSchema = z.object({
  harness: z.string().min(1),
  kind: z.string().min(1).optional(),  // herdr --kind value (opencode, claude, codex, ...)
  persona: z.string().optional(),
  auto_approve: z.boolean().default(false),  // auto-interact when agent hits blocked lifecycle
})
```

### `src/config/defaults.ts`

Add `kind: 'opencode'` to each default agent (implementer, reviewer, tester). `auto_approve` stays `false` by default.

### `.beans.yml` hordr config (if user has agents configured)

Document that `kind` maps to herdr's `--kind` flag. When `kind` is absent, fall back to deriving from `harness` (e.g., `harness: opencode` → `kind: opencode`). Add a warning when `kind` can't be derived and `agent start` is used.

## Acceptance Criteria

- [ ] `AgentDefSchema` has `kind: z.string().min(1).optional()` and `auto_approve: z.boolean().default(false)`
- [ ] Default agents in `defaults.ts` include `kind: 'opencode'`
- [ ] Config loader derives `kind` from `harness` when `kind` is absent (same string)
- [ ] Warning logged when `kind` can't be derived and agent-start spawn path is used
- [ ] Existing config loading tests pass with the new fields
- [ ] New test: config with explicit `kind` and `auto_approve` loads correctly
- [ ] `bun run lint` passes
