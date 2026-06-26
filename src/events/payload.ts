/**
 * Parse herdr plugin event payloads.
 *
 * herdr fires event hooks with two env vars (verified against herdr v0.7.0):
 *   HERDR_PLUGIN_EVENT       = "worktree.created" | "worktree.removed" | ...
 *   HERDR_PLUGIN_EVENT_JSON  = JSON string with shape:
 *     {
 *       "event": "worktree_created" | "worktree_removed" | ...,
 *       "data": {
 *         "type": "worktree_created" | ...,
 *         "workspace": { "workspace_id": "wX", "worktree": {...}, ... },
 *         "worktree": {
 *           "path": "...",
 *           "branch": "bean/hordr-1234",
 *           "open_workspace_id": "wX",
 *           "label": "...",
 *           ...
 *         }
 *       }
 *     }
 *
 * Also useful: HERDR_PLUGIN_ID, HERDR_PLUGIN_STATE_DIR (the latter is already
 * consumed by src/state/run-store.ts for state file placement).
 */
/* eslint-disable camelcase -- field names mirror herdr's on-the-wire JSON event contract (workspace_id, open_workspace_id, checkout_path) */
import process from 'node:process'
import {z} from 'zod'

export class EventPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EventPayloadError'
  }
}

const WorkspaceSchema = z.object({
  workspace_id: z.string(),
  worktree: z
    .object({
      checkout_path: z.string().optional(),
    })
    .passthrough()
    .optional(),
})

const WorktreeSchema = z.object({
  branch: z.string(),
  open_workspace_id: z.string().optional(),
  path: z.string().optional(),
})

const EventDataSchema = z.object({
  type: z.string(),
  workspace: WorkspaceSchema.passthrough().optional(),
  worktree: WorktreeSchema.passthrough().optional(),
})

const EventEnvelopeSchema = z.object({
  data: EventDataSchema.passthrough(),
  event: z.string(),
})

export interface WorktreeEvent {
  branch: null | string
  eventName: 'worktree_created' | 'worktree_removed' | string
  path: null | string
  workspaceId: null | string
}

/**
 * Read + validate the event payload from HERDR_PLUGIN_EVENT_JSON.
 * Throws EventPayloadError if the env var is missing or malformed.
 */
export function readWorktreeEvent(): WorktreeEvent {
  const raw = process.env.HERDR_PLUGIN_EVENT_JSON
  if (!raw) {
    throw new EventPayloadError(
      'HERDR_PLUGIN_EVENT_JSON not set; this command must be invoked by herdr as an event hook',
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new EventPayloadError(
      `HERDR_PLUGIN_EVENT_JSON is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const result = EventEnvelopeSchema.safeParse(parsed)
  if (!result.success) {
    throw new EventPayloadError(
      `event payload shape mismatch: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    )
  }

  const evt = result.data
  return {
    branch: evt.data.worktree?.branch ?? null,
    eventName: evt.event,
    path: evt.data.worktree?.path ?? evt.data.workspace?.worktree?.checkout_path ?? null,
    workspaceId: evt.data.worktree?.open_workspace_id ?? evt.data.workspace?.workspace_id ?? null,
  }
}

/**
 * Extract a bean id from a worktree branch name.
 * Returns null for non-hordr branches (e.g. `feature/foo`, `develop`).
 *
 * Example: "bean/hordr-1234" with prefix "bean/" → "hordr-1234".
 */
export function beanIdFromBranch(branch: string, prefix = 'bean/'): null | string {
  if (!branch.startsWith(prefix)) return null
  const id = branch.slice(prefix.length)
  return id.length > 0 ? id : null
}
