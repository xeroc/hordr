/**
 * Build the git commit trailer line for a bean.
 * Format: `Refs: <beanId>` (single line, suitable for `git commit --trailer=...`).
 *
 * (SPEC §4 commit step: "Implementer commits with trailer Refs: <prefix><id>".
 * The bean id we hold already includes the configured prefix, so no lookup.)
 */
export function commitTrailer(beanId: string): string {
  if (!beanId) throw new Error('beanId is required')
  return `Refs: ${beanId}`
}

/**
 * Build a conventional-commit PR title for a bean.
 * Format: `<type>: <subject> (Refs: <beanId>)`.
 *
 * Default type is 'feat' per AC. Callers that need another type can slice/replace.
 */
export function prTitle(beanId: string, subject: string, type = 'feat'): string {
  if (!beanId) throw new Error('beanId is required')
  if (!subject) throw new Error('subject is required')
  return `${type}: ${subject} (Refs: ${beanId})`
}
