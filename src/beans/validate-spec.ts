export interface SpecValidation {
  empty: string[]
  missing: string[]
  valid: boolean
}

const REQUIRED_SECTIONS = ['## Requirement', '## Spec', '## Acceptance Criteria', '## Test Plan'] as const

const CHECKBOX_RE = /^\s*- \[ \]\s*\S/

// ponytail: headers inside ```code blocks``` are not detected; real bean bodies don't do this.
export function validateSpec(body: string): SpecValidation {
  const lines = body.split('\n')
  const missing: string[] = []
  const empty: string[] = []

  for (const header of REQUIRED_SECTIONS) {
    const idx = lines.findIndex((line) => line.trim() === header)
    if (idx === -1) {
      missing.push(header)
      continue
    }

    let end = idx + 1
    while (end < lines.length && !lines[end].startsWith('## ')) end++
    const section = lines.slice(idx + 1, end)

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
