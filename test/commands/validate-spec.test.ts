/* eslint-disable camelcase -- created_at/updated_at mirror beans JSON contract */
import {captureOutput} from '@oclif/test'
import {expect} from 'chai'

import {_resetShell, _setBeansPresentForTesting, _setShellForTesting} from '../../src/beans/client.js'
import ValidateSpec from '../../src/commands/validate-spec.js'

const VALID_BODY = `
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

const BODY_MISSING_SPEC = `
## Requirement

We need a thing.

## Acceptance Criteria

- [ ] Criterion one

## Test Plan

Run the tests.
`.trim()

const BODY_EMPTY_REQUIREMENT = `
## Requirement


## Spec

Build the thing.

## Acceptance Criteria

- [ ] Criterion one

## Test Plan

Run the tests.
`.trim()

function beanJson(body: string): string {
  return JSON.stringify({
    body,
    created_at: '',
    etag: '',
    id: 'hordr-1234',
    path: '',
    priority: '',
    slug: '',
    status: 'draft',
    title: '',
    type: '',
    updated_at: '',
  })
}

const PROJECT_ROOT = process.cwd()

describe('commands/validate-spec', () => {
  beforeEach(() => {
    _setBeansPresentForTesting(true)
    process.exitCode = undefined
  })

  afterEach(() => {
    _resetShell()
    process.exitCode = undefined
  })

  it('valid body: exit 0, stdout says valid', async () => {
    _setShellForTesting(() => beanJson(VALID_BODY))
    const result = await captureOutput(async () => {
      await ValidateSpec.run(['hordr-1234'], {root: PROJECT_ROOT})
    })
    expect(result.error).to.be.undefined
    expect(result.stdout).to.match(/valid/)
    expect(process.exitCode).to.not.equal(1)
  })

  it('invalid body (missing section): exit 1, stdout lists missing', async () => {
    _setShellForTesting(() => beanJson(BODY_MISSING_SPEC))
    const result = await captureOutput(async () => {
      await ValidateSpec.run(['hordr-1234'], {root: PROJECT_ROOT})
    })
    expect(result.stdout).to.match(/missing/)
    expect(result.stdout).to.match(/## Spec/)
    expect(process.exitCode).to.equal(1)
  })

  it('invalid body (empty section): exit 1, stdout lists empty', async () => {
    _setShellForTesting(() => beanJson(BODY_EMPTY_REQUIREMENT))
    const result = await captureOutput(async () => {
      await ValidateSpec.run(['hordr-1234'], {root: PROJECT_ROOT})
    })
    expect(result.stdout).to.match(/empty/)
    expect(result.stdout).to.match(/## Requirement/)
    expect(process.exitCode).to.equal(1)
  })

  it('--json flag: structured output', async () => {
    _setShellForTesting(() => beanJson(BODY_MISSING_SPEC))
    const result = await captureOutput(async () => {
      await ValidateSpec.run(['hordr-1234', '--json'], {root: PROJECT_ROOT})
    })
    const parsed = JSON.parse(result.stdout.trim())
    expect(parsed).to.have.property('valid', false)
    expect(parsed).to.have.property('missing')
    expect(parsed.missing).to.include('## Spec')
    expect(parsed).to.have.property('empty')
  })

  it('--json flag on valid body: valid=true', async () => {
    _setShellForTesting(() => beanJson(VALID_BODY))
    const result = await captureOutput(async () => {
      await ValidateSpec.run(['hordr-1234', '--json'], {root: PROJECT_ROOT})
    })
    const parsed = JSON.parse(result.stdout.trim())
    expect(parsed).to.have.property('valid', true)
  })
})
