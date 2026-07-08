/**
 * Lane lifecycle state machine (ADR-0014).
 *
 * pending (epic blocked, no worktree)
 *   → active (worktree created, dispatch loop running)
 *     → merging (epic done, merging to milestone branch)
 *       → done (merged, worktree removed)
 *       → conflict (merge conflict, human needed) → done
 */
export type LaneStatus = 'active' | 'conflict' | 'done' | 'merging' | 'pending'

export const VALID_TRANSITIONS: Record<LaneStatus, LaneStatus[]> = {
  active: ['merging'],
  conflict: ['done'],
  done: [],
  merging: ['conflict', 'done'],
  pending: ['active'],
}

export function canTransition(from: LaneStatus, to: LaneStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}
