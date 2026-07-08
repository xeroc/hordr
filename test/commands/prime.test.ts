import type {Config} from '@oclif/core'

import {expect} from 'chai'

import Prime from '../../src/commands/prime.js'

const stubConfig = {
  bin: 'hordr',
  name: 'hordr',
  runHook: async () => ({failures: [], successes: []}),
  topicSeparator: ' ',
  version: '0.0.0',
} as unknown as Config

describe('commands/prime', () => {
  it('outputs the hordr agent guide with key sections', async () => {
    const out: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk) => {
      out.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    }

    try {
      const cmd = new Prime([], stubConfig)
      await cmd.run()
    } finally {
      process.stdout.write = origWrite
    }

    const text = out.join('')
    expect(text).to.contain('Bean hierarchy')
    expect(text).to.contain('assigned:')
    expect(text).to.contain('implementer')
    expect(text).to.contain('tester')
    expect(text).to.contain('reviewer')
    expect(text).to.contain('--blocked-by')
    expect(text).to.contain('fleet create')
    expect(text).to.contain('Pure functions')
    expect(text).to.contain('beans prime')
  })
})
