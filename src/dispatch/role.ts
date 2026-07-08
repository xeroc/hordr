/**
 * Role/persona resolution from a bean's `assigned:` field (ADR-0009).
 *
 * The daemon is role-agnostic — it picks the next ready bean, reads its
 * `assigned:` frontmatter field, and resolves the persona+harness from the
 * company manifest (via HordrConfig.agents). Mixed harness backends per role
 * (opencode, claude, codex) fall out for free.
 */
import type {BeanRecord} from '../beans/client.js'
import type {HordrConfig} from '../config/schema.js'

const DEFAULT_ROLE = 'implementer'

export class DispatchError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DispatchError'
  }
}

export interface ResolvedRole {
  harness: string
  persona: string
  role: string
}

/** Resolve which role/harness/persona to use for a bean. */
export function resolveRole(bean: BeanRecord, config: HordrConfig): ResolvedRole {
  // assigned: is a passthrough frontmatter field, not in BeanRecord's typed shape.
  const assigned = (bean as Record<string, unknown>).assigned as string | undefined
  const role = assigned ?? DEFAULT_ROLE

  const agent = config.agents[role]
  if (!agent) {
    throw new DispatchError(`bean ${bean.id} assigned to unknown role '${role}' (not in config.agents)`)
  }

  return {
    harness: agent.harness,
    persona: agent.persona ?? '',
    role,
  }
}
