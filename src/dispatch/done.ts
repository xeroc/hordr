/* eslint-disable camelcase -- task_id mirrors the socket JSON contract */
/**
 * /done route handler (ADR-0010, ADR-0011).
 *
 * Called by the member after it commits and marks the bean completed.
 * Verifies the bean is actually completed (the member may have forgotten or
 * lied), then returns 200. The daemon's fleet loop uses this signal to
 * trigger rollup and dispatch the next task.
 *
 * On bean-not-completed: returns 409 Conflict — the member signalled done
 * but the bean state doesn't confirm it. The daemon marks the task blocked.
 */
export interface DaemonResponse {
  body: unknown
  status: number
}

export interface DoneDeps {
  /** Returns true if the bean's status is 'completed' in the worktree. */
  verifyCompleted: (taskId: string) => boolean
}

/** Handle POST /done. Validates the body, verifies completion, returns response. */
export function handleDone(body: unknown, deps: DoneDeps): DaemonResponse {
  const req = (body ?? {}) as {task_id?: string}
  if (!req.task_id) return {body: {error: 'missing task_id'}, status: 400}

  if (!deps.verifyCompleted(req.task_id)) {
    return {body: {error: `bean ${req.task_id} not completed`}, status: 409}
  }

  return {body: {ok: true, task_id: req.task_id}, status: 200}
}
