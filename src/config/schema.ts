/* eslint-disable camelcase -- keys mirror .beans.yml field names */
import {z} from 'zod'

export const AgentDefSchema = z.object({
  // harness may be omitted per-agent; loadConfig fills it from default_harness.
  // An empty string also means "inherit default_harness".
  harness: z.string().default(''),
  // Optional in schema — validated at runtime in loadConfig. When a company
  // context is active, persona comes from AGENTS.md body.
  persona: z.string().optional(),
})

export type AgentDef = z.infer<typeof AgentDefSchema>

export const CompanyRefSchema = z.object({
  // Path to the Agent Companies package root (where COMPANY.md, agents/, skills/ live).
  path: z.string().min(1),
})

export const HordrConfigSchema = z.object({
  agents: z.record(z.string(), AgentDefSchema).default({}),
  company: CompanyRefSchema.nullable().optional(),
  // Harness used for any agent that doesn't set its own `harness`. Flip this
  // one line to repoint every persona (defaults + user agents) at a different
  // binary (claude, codex, opencode, …). An explicit agent.harness always wins.
  default_harness: z.string().min(1).default('opencode'),
  // Version control system hordr drives: 'git' (herdr worktrees) or 'jj'
  // (colocated jj workspaces). Per-repo property — one knob, no per-agent
  // override. jj mode requires a colocated repo (see src/vcs/resolve.ts).
  default_vcs: z.enum(['git', 'jj']).default('git'),
})

export type HordrConfig = z.infer<typeof HordrConfigSchema>
