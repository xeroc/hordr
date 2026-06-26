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
})
