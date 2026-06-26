export interface SpecValidation {
  empty: string[]
  missing: string[]
  valid: boolean
}

export type BeanType = 'bug' | 'epic' | 'feature' | 'milestone' | 'task'

/**
 * Section contract per bean type (ADR-0008):
 *   task/bug/feature/milestone → 4 sections (unchanged v1 contract)
 *   epic → 6 sections (adds Decisions + Decomposition)
 *
 * For epics:
 *   - Decisions may have empty body (no ADRs yet) but the header MUST exist.
 *   - Decomposition may have empty body (not yet decomposed) but the header
 *     MUST exist.
 *   - Acceptance Criteria still requires a `- [ ]` checkbox (same as task).
 */
const TASK_SECTIONS = ['## Requirement', '## Spec', '## Acceptance Criteria', '## Test Plan'] as const
const EPIC_SECTIONS = [
  '## Requirement',
  '## Spec',
  '## Decisions',
  '## Decomposition',
  '## Acceptance Criteria',
  '## Test Plan',
] as const

/** Sections whose header must exist but whose body may legitimately be empty. */
const HEADER_ONLY_OK_FOR_EPIC = new Set(['## Decisions', '## Decomposition'])

const CHECKBOX_RE = /^\s*- \[ \]\s*\S/

function sectionsFor(type: BeanType): readonly string[] {
  return type === 'epic' ? EPIC_SECTIONS : TASK_SECTIONS
}

// ponytail: headers inside ```code blocks``` are not detected; real bean bodies don't do this.
export function validateSpec(body: string, type: BeanType = 'task'): SpecValidation {
  const lines = body.split('\n')
  const missing: string[] = []
  const empty: string[] = []
  const required = sectionsFor(type)
  const headerOnlyOk = type === 'epic' ? HEADER_ONLY_OK_FOR_EPIC : new Set<string>()

  for (const header of required) {
    const idx = lines.findIndex((line) => line.trim() === header)
    if (idx === -1) {
      missing.push(header)
      continue
    }

    let end = idx + 1
    while (end < lines.length && !lines[end].startsWith('## ')) end++
    const section = lines.slice(idx + 1, end)

    // Header-only-OK sections just need the header; body content optional.
    if (headerOnlyOk.has(header)) continue

    const hasContent =
      header === '## Acceptance Criteria'
        ? section.some((line) => CHECKBOX_RE.test(line))
        : section.some((line) => line.trim().length > 0)

    if (!hasContent) empty.push(header)
  }

  return {
    empty,
    missing,
    valid: missing.length === 0 && empty.length === 0,
  }
}
