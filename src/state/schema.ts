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
  worktree: z
    .object({
      branch: z.string(),
      path: z.string().optional(),
      // Set to true by on-worktree-removed event hook when herdr removes the
      // worktree out-of-band. Branch is preserved so close-merged can still
      // find the PR by branch name; handlers skip herdr calls when removed.
      removed: z.boolean().optional(),
      workspace_id: z.string(),
    })
    .nullable(),
})

export type RunState = z.infer<typeof RunStateSchema>
export type RunStatus = RunState['status']
export type RunFilter = {status?: RunStatus}
