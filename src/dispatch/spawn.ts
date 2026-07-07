import {shellQuote} from '../harness/launcher.js'
/**
 * Ephemeral invocation spawn (ADR-0009).
 *
 * Builds the fleet-shaped prompt (persona + bean body + hordr-done
 * completion instructions) and runs the harness in the fleet's pane.
 * One invocation = one task = one commit. The pane is reused across
 * sequential invocations (ADR-0009 pane reuse).
 */
import {runInPane} from '../herdr/pane.js'

/** Build the full prompt the agent receives: persona → bean → done instructions. */
export function buildInvocationPrompt(opts: {beanBody: string; beanId: string; persona: string}): string {
  return `${opts.persona}

---

# Bean ${opts.beanId}

${opts.beanBody}

---

## Completion

When you have implemented the changes described in this bean:
1. Update the bean status: \`beans update ${opts.beanId} -s completed\`
2. Commit all your changes (code + bean) using the commit skill
3. Notify the fleet: \`hordr done ${opts.beanId}\`

Then stop. Do not work on any other bean.`
}

/** Spawn the harness in the given pane with the prompt. Fire-and-forget. */
export function spawnInvocation(opts: {harness: string; paneId: string; prompt: string}): void {
  const command = `${opts.harness} run --interactive ${shellQuote(opts.prompt)}`
  runInPane(opts.paneId, command)
}
