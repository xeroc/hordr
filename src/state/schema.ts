/* eslint-disable camelcase -- field names match SPEC.md §3 on-disk JSON contract */
import {z} from 'zod'

export const RunStateSchema = z.object({
  bean: z.string(),
  panes: z.record(z.string()),
  started_unix: z.number(),
  status: z.enum(['awaiting-approval', 'blocked', 'closed', 'planning', 'pr-open', 'queued', 'running']),
  step: z.number(),
  updated_unix: z.number(),
  workflow: z.string(),
  worktree: z.object({branch: z.string(), workspace_id: z.string()}).nullable(),
})

export type RunState = z.infer<typeof RunStateSchema>
export type RunStatus = RunState['status']
export type RunFilter = {status?: RunStatus}
