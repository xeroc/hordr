/* eslint-disable camelcase -- keys mirror SPEC §6 YAML config field names */
import {z} from 'zod'

export const StepKindSchema = z.enum(['draft-spec', 'hitl', 'implement', 'test', 'review', 'commit', 'pr', 'cleanup'])

export const StepDefSchema = z.object({
  agent: z.string().min(1).optional(),
  kind: StepKindSchema,
  optional: z.boolean().default(false),
  pane: z.enum(['root', 'sibling']).optional(),
  wait: z.string().optional(),
})

export const WorkflowDefSchema = z.object({
  steps: z.array(StepDefSchema),
})

export const AgentDefSchema = z.object({
  harness: z.string().min(1),
  persona: z.string().min(1),
})

export const RoutingDefSchema = z.object({
  default_workflow: z.string().min(1),
  plan_workflow: z.string().min(1),
})

export const HordrConfigSchema = z.object({
  agents: z.record(z.string(), AgentDefSchema).default({}),
  concurrency: z.number().int().positive().default(3),
  primary_branch: z.string().min(1).default('develop'),
  routing: RoutingDefSchema.optional(),
  workflows: z.record(z.string(), WorkflowDefSchema).default({}),
  worktree_branch_prefix: z.string().min(1).default('bean/'),
})

export type HordrConfig = z.infer<typeof HordrConfigSchema>
