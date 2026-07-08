/* eslint-disable camelcase -- keys mirror .beans.yml field names */
import {z} from 'zod'

export const AgentDefSchema = z.object({
  harness: z.string().min(1),
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
  primary_branch: z.string().min(1).default('develop'),
  worktree_branch_prefix: z.string().min(1).default('bean/'),
})

export type HordrConfig = z.infer<typeof HordrConfigSchema>
