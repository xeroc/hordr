/* eslint-disable camelcase -- field names match SPEC.md §3 on-disk JSON contract */
import {z} from 'zod'

export const RunStateSchema = z.object({
  bean: z.string(),
  // Single-pane-per-run model: one pane reused across agent roles.
  // Step transitions respawn the same pane with a new prompt.
  // See hordr-khga.
  pane_step: z.number().int().nonnegative().optional(),
  panes: z.record(z.string()),
  started_unix: z.number(),
  status: z.enum(['awaiting-approval', 'blocked', 'closed', 'pr-open', 'queued', 'running']),
  step: z.number(),
  updated_unix: z.number(),
  workflow: z.string(),
  worktree: z
    .object({
      branch: z.string(),
      path: z.string().optional(),
      removed: z.boolean().optional(),
      workspace_id: z.string(),
    })
    .nullable(),
})

export type RunState = z.infer<typeof RunStateSchema>
export type RunStatus = RunState['status']
export type RunFilter = {status?: RunStatus}
