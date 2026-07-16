/* eslint-disable camelcase -- task_id mirrors the socket JSON contract */
/**
 * /done route handler (ADR-0010, ADR-0011, hordr-w8w2).
 *
 * Called by the member after it commits and marks the bean completed. /done is
 * an acceptance gate: it verifies (a) the worktree is clean — no uncommitted
 * changes — and (b) the bean is actually marked completed. On failure it
 * returns 409 with specific, actionable reasons so the agent can fix the
 * problem (commit / mark completed) and retry `hordr done`.
 *
 * Race handling: a 5s heal tick can land between the agent marking completed
 * and calling /done, clearing the lane's currentTaskBeanId after the heal poll
 * itself verified clean+completed. So if no lane owns the task, the acceptance
 * checks already passed via heal — ack OK idempotently rather than report a
 * false failure.
 */
export interface DaemonResponse {
  body: unknown
  status: number
}

/** Outcome of the /done acceptance checks. `errors` is empty when `ok`. */
export interface VerifyResult {
  errors: string[]
  ok: boolean
}

/**
 * Probes the acceptance checks run against. Each is real I/O in the daemon
 * (lane lookup + beans query + git porcelain) and mocked in tests. Add a probe
 * here to add a new assert.
 */
export interface DoneProbes {
  /** Current bean status in the worktree ('completed', 'in-progress', ...). */
  beanStatus: (taskId: string, cwd: string) => string | undefined
  /** `git status --porcelain` lines in the worktree — empty array means clean. */
  dirtyPaths: (cwd: string) => string[]
  /** Resolve the worktree path the task runs in, or undefined if no lane owns it. */
  worktreePath: (taskId: string) => string | undefined
}

/**
 * Run the /done acceptance checks and return specific, actionable errors.
 * Pure: all I/O is in `probes`. Returns `{ok: true}` when no lane owns the
 * task (heal already processed it).
 */
export function runDoneChecks(taskId: string, probes: DoneProbes): VerifyResult {
  const cwd = probes.worktreePath(taskId)
  if (cwd === undefined) return {errors: [], ok: true}

  const errors: string[] = []

  const status = probes.beanStatus(taskId, cwd)
  if (status !== 'completed') {
    errors.push(
      `bean ${taskId} status is '${status ?? 'unknown'}', expected 'completed' — ` +
        `mark it completed and commit (beans update ${taskId} -s completed), then retry 'hordr done ${taskId}'`,
    )
  }

  const dirty = probes.dirtyPaths(cwd)
  if (dirty.length > 0) {
    errors.push(
      `uncommitted changes in ${cwd}:\n${dirty.map((p) => `  ${p}`).join('\n')}\n` +
        `commit them, then retry 'hordr done ${taskId}'`,
    )
  }

  return {errors, ok: errors.length === 0}
}

export interface DoneDeps {
  /** Run all /done acceptance checks for a task. */
  verify: (taskId: string) => VerifyResult
}

/** Handle POST /done. Validates the body, runs verification, returns response. */
export function handleDone(body: unknown, deps: DoneDeps): DaemonResponse {
  const req = (body ?? {}) as {task_id?: string}
  if (!req.task_id) return {body: {error: 'missing task_id'}, status: 400}

  const result = deps.verify(req.task_id)
  if (!result.ok) {
    return {body: {error: result.errors.join(' '), task_id: req.task_id}, status: 409}
  }

  return {body: {ok: true, task_id: req.task_id}, status: 200}
}
