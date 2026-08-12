import type {Config} from '@oclif/core'

import {expect} from 'chai'
import {parse} from 'yaml'

import ConfigCmd from '../../src/commands/config.js'
import {HordrConfigSchema} from '../../src/config/schema.js'

const stubConfig = {
  bin: 'hordr',
  name: 'hordr',
  runHook: async () => ({failures: [], successes: []}),
  topicSeparator: ' ',
  version: '0.0.0',
} as unknown as Config

describe('commands/config', () => {
  it('prints a fully-commented hordr: block with every knob', async () => {
    const out: string[] = []
    const origWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = (chunk) => {
      out.push(typeof chunk === 'string' ? chunk : chunk.toString())
      return true
    }

    try {
      const cmd = new ConfigCmd([], stubConfig)
      await cmd.run()
    } finally {
      process.stdout.write = origWrite
    }

    const text = out.join('')
    // Top-level hordr block marker so `>> .beans.yml` produces a valid section
    expect(text).to.contain('hordr:')
    // Every documented knob must appear so the output is self-describing
    expect(text).to.contain('primary_branch')
    expect(text).to.contain('default_harness')
    expect(text).to.contain('agents:')
    expect(text).to.contain('harness:')
    expect(text).to.contain('persona:')
    // Default roles listed so users know what they can override
    expect(text).to.contain('implementer')
    expect(text).to.contain('reviewer')
    expect(text).to.contain('tester')
    // Comments present (so it reads as an example, not a bare config)
    expect(text).to.match(/^\s*#/m)

    // The generated block must parse as valid YAML + satisfy the schema
    // (guards the example from drifting into invalid config). Strip full-line
    // and trailing comments first, then parse the `hordr:` block.
    const stripped = text
      .split('\n')
      .map((l) => l.replace(/(^|\s+)#.*$/, '$1').trimEnd())
      .join('\n')
    const doc = parse(stripped) as Record<string, unknown>
    expect(doc).to.have.property('hordr')
    expect(() => HordrConfigSchema.parse(doc.hordr)).to.not.throw()
  })
})
