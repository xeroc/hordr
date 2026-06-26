import {expect} from 'chai'

import {validateSpec} from '../../src/beans/validate-spec.js'

const BASE_VALID_BODY = `
## Requirement

We need a thing.

## Spec

Build the thing.

## Acceptance Criteria

- [ ] Criterion one
- [ ] Criterion two

## Test Plan

Run the tests.
`.trim()

// Match `header` through to (not including) the next `## ` line, or end of body.
function sliceSection(header: string): string {
  return `${header}\\n.*?(?=\\n## |$)`
}

function without(header: string): string {
  return BASE_VALID_BODY.replace(new RegExp(sliceSection(header), 's'), '').trim()
}

function emptied(header: string): string {
  return BASE_VALID_BODY.replace(new RegExp(sliceSection(header), 's'), header).trim()
}

describe('validate-spec', () => {
  it('complete body is valid', () => {
    expect(validateSpec(BASE_VALID_BODY)).to.deep.equal({
      empty: [],
      missing: [],
      valid: true,
    })
  })

  // Existing tests use the default `task` type — make it explicit so the
  // type-aware dispatch (ADR-0008) is exercised.
  it('complete body is valid (explicit task type)', () => {
    expect(validateSpec(BASE_VALID_BODY, 'task').valid).to.equal(true)
  })

  for (const header of ['## Requirement', '## Spec', '## Acceptance Criteria', '## Test Plan']) {
    it(`reports ${header} in missing when absent`, () => {
      const result = validateSpec(without(header))
      expect(result.valid).to.equal(false)
      expect(result.missing).to.include(header)
    })

    it(`reports ${header} in empty when header present but body blank`, () => {
      const result = validateSpec(emptied(header))
      expect(result.valid).to.equal(false)
      expect(result.empty).to.include(header)
    })
  }

  it('reports Acceptance Criteria empty when it has prose but no checkbox', () => {
    const body = BASE_VALID_BODY.replace(
      new RegExp(sliceSection('## Acceptance Criteria'), 's'),
      '## Acceptance Criteria\n\nAC: it works, no checkbox here.',
    ).trim()
    const result = validateSpec(body)
    expect(result.valid).to.equal(false)
    expect(result.empty).to.include('## Acceptance Criteria')
  })

  it('ignores extra sections like ## Notes', () => {
    const body = `${BASE_VALID_BODY}\n\n## Notes\nsome notes`
    expect(validateSpec(body)).to.deep.equal({
      empty: [],
      missing: [],
      valid: true,
    })
  })

  it('treats blank lines after a header as cosmetic', () => {
    const body = BASE_VALID_BODY.replace('## Requirement\n', '## Requirement\n\n\n\n')
    expect(validateSpec(body).valid).to.equal(true)
  })

  describe('epic type, 6 sections (ADR-0008)', () => {
    const BASE_VALID_EPIC_BODY = `
## Requirement

We need a system.

## Spec

Full technical spec lives here.

## Decisions

- [ADR-0001](docs/adr/0001-foo.md) — Foo approach (accepted)

## Decomposition

<!-- empty until hordr decompose runs -->

## Acceptance Criteria

- [ ] Epic-level integration test passes

## Test Plan

E2E verification.
`.trim()

    it('complete epic body is valid', () => {
      const result = validateSpec(BASE_VALID_EPIC_BODY, 'epic')
      expect(result).to.deep.equal({empty: [], missing: [], valid: true})
    })

    it('epic with empty Decisions body is valid (header-only ok)', () => {
      const body = BASE_VALID_EPIC_BODY.replace(new RegExp(sliceSection('## Decisions'), 's'), '## Decisions\n').trim()
      const result = validateSpec(body, 'epic')
      expect(result.valid).to.equal(true)
      expect(result.empty).to.not.include('## Decisions')
    })

    it('epic with empty Decomposition body is valid (header-only ok)', () => {
      const body = BASE_VALID_EPIC_BODY.replace(
        new RegExp(sliceSection('## Decomposition'), 's'),
        '## Decomposition\n',
      ).trim()
      const result = validateSpec(body, 'epic')
      expect(result.valid).to.equal(true)
      expect(result.empty).to.not.include('## Decomposition')
    })

    it('epic missing ## Decisions header is invalid', () => {
      const b = BASE_VALID_EPIC_BODY.replace(new RegExp(sliceSection('## Decisions'), 's'), '').trim()
      const result = validateSpec(b, 'epic')
      expect(result.valid).to.equal(false)
      expect(result.missing).to.include('## Decisions')
    })

    it('epic missing ## Decomposition header is invalid', () => {
      const b = BASE_VALID_EPIC_BODY.replace(new RegExp(sliceSection('## Decomposition'), 's'), '').trim()
      const result = validateSpec(b, 'epic')
      expect(result.valid).to.equal(false)
      expect(result.missing).to.include('## Decomposition')
    })

    it('epic AC still requires a checkbox', () => {
      const body = BASE_VALID_EPIC_BODY.replace(
        new RegExp(sliceSection('## Acceptance Criteria'), 's'),
        '## Acceptance Criteria\n\nNo checkbox here.',
      ).trim()
      const result = validateSpec(body, 'epic')
      expect(result.valid).to.equal(false)
      expect(result.empty).to.include('## Acceptance Criteria')
    })

    it('epic body validated as task type ignores Decisions/Decomposition', () => {
      const result = validateSpec(BASE_VALID_EPIC_BODY, 'task')
      expect(result.valid).to.equal(true)
    })

    it('task body validated as epic type reports missing Decisions + Decomposition', () => {
      const result = validateSpec(BASE_VALID_BODY, 'epic')
      expect(result.valid).to.equal(false)
      expect(result.missing).to.include('## Decisions')
      expect(result.missing).to.include('## Decomposition')
    })
  })
})
