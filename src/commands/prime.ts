import { Command } from '@oclif/core'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const THIS_DIR = dirname(fileURLToPath(import.meta.url))
const SKILL_PATH = join(THIS_DIR, '..', '..', '.agents', 'skills', 'hordr', 'SKILL.md')

export default class Prime extends Command {
  static description = 'Output a condensed guide for agents working within hordr. Run after `beans prime`.'
  static examples = ['<%= config.bin %> prime']

  async run(): Promise<void> {
    const skill = readFileSync(SKILL_PATH, 'utf8')
    const body = skill.replace(/---\n[\s\S]*?---\n/, '').trim()
    this.log(body)
  }
}
