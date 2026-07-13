/* eslint-disable camelcase -- task_id mirrors the socket JSON contract */
/**
 * /blocked route handler.
 *
 * Called by the agent when it discovers its task is blocked by unmet
 * dependencies and cannot proceed. Unlike /done (which signals completion),
 * /blocked signals "I'm intentionally stopping — release the lane so the
 * daemon can dispatch other work, and re-dispatch this task once its
 * blockers resolve."
 *
 * The handler clears the lane's currentTaskBeanId. The task stays in its
 * current status (usually todo). The lane stays active — on the next tick,
 * getDispatchable will skip the blocked task (beans --ready excludes it)
 * and the lane goes idle until the blocker clears.
 */
export interface DaemonResponse {
  body: unknown
  status: number
}

export interface BlockedDeps {
  /** Find the lane owning this task, clear its currentTaskBeanId. Returns false if no lane owns it. */
  releaseTask: (taskId: string) => boolean
}

/** Handle POST /blocked. Validates body, releases the lane, returns response. */
export function handleBlocked(body: unknown, deps: BlockedDeps): DaemonResponse {
  const req = (body ?? {}) as {reason?: string; task_id?: string}
  if (!req.task_id) return {body: {error: 'missing task_id'}, status: 400}

  const released = deps.releaseTask(req.task_id)
  if (!released) {
    return {body: {error: `no active lane owns task ${req.task_id}`}, status: 404}
  }

  return {body: {ok: true, task_id: req.task_id}, status: 200}
}
