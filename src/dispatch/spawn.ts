import { shellQuote } from '../harness/launcher.js'
/**
 * Ephemeral invocation spawn (ADR-0009).
 *
 * Builds the fleet-shaped prompt (persona + ancestor context + bean body +
 * hordr-done completion instructions) and runs the harness in the fleet's pane.
 * One invocation = one task = one commit. The pane is reused across sequential
 * invocations (ADR-0009 pane reuse).
 */
import { runInPane } from '../herdr/pane.js'

/** A single ancestor bean rendered as context in the prompt. */
export interface AncestorContext {
  body: string
  id: string
  title: string
  type: string
}

/** Build the full prompt: persona → ancestor context → leaf bean → done instructions. */
export function buildInvocationPrompt(opts: {
  ancestors?: AncestorContext[]
  beanBody: string
  beanId: string
  persona: string
}): string {
  const contextSection =
    (opts.ancestors ?? []).length > 0
      ? `\n---\n\n# Context — Ancestor Beans (READ ONLY: for context only, do NOT implement these)\n\n${opts
        .ancestors!.map((a) => `## ${a.type}: ${a.title} (${a.id})\n\n${a.body}`)
        .join('\n\n')}\n`
      : ''

  return `${opts.persona}
${contextSection}
---

# CURRENT BEAN: ${opts.beanId}

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
export function spawnInvocation(opts: { harness: string; paneId: string; prompt: string }): void {
  const command = `${opts.harness} run --interactive ${shellQuote(opts.prompt)}`
  runInPane(opts.paneId, command)
}
