/**
 * Test signal detection from a tester agent's recent pane output.
 *
 * After `waitForAgentDone` returns on the tester pane, the engine calls this to
 * decide whether to advance (green) or block the Run (red).
 */
import {readPane} from '../herdr/pane.js'

/**
 * Scan recent pane output for the literals `test-green` / `test-red`
 * (case-sensitive, per AC). Returns `"green"`, `"red"`, or `null`.
 *
 * ponytail: red is checked first so the "both present → red" fail-safe AC
 * falls out of the ordering for free. Order is load-bearing; do not reorder.
 *
 * Note: the param name `paneLabel` is a misnomer — at runtime it's a pane_id.
 */
export function detectTestSignal(paneLabel: string): 'green' | 'red' | null {
  const output = readPane({paneId: paneLabel})
  if (output.includes('test-red')) return 'red'
  if (output.includes('test-green')) return 'green'
  return null
}
