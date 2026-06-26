import {expect} from 'chai'
import {execFileSync} from 'node:child_process'
import {readFileSync} from 'node:fs'
import {dirname, resolve} from 'node:path'
import {fileURLToPath} from 'node:url'

import {beanIdFromBranch} from '../../src/events/payload.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MANIFEST_PATH = resolve(__dirname, '../../herdr-plugin.toml')

function parseTomlCount(haystack: string, marker: string): number {
  const matches = haystack.match(new RegExp(`^\\[\\[${marker}\\]\\]`, 'gm'))
  return matches ? matches.length : 0
}

describe('herdr plugin manifest, event hooks, and helpers (hordr-1701, hordr-1702)', () => {
  describe('herdr-plugin.toml manifest (hordr-1701)', () => {
    it('is present at the project root', () => {
      const content = readFileSync(MANIFEST_PATH, 'utf8')
      expect(content).to.be.a('string')
      expect(content.length).to.be.greaterThan(0)
    })

    it('declares required plugin metadata (id, name, version, min_herdr_version)', () => {
      const content = readFileSync(MANIFEST_PATH, 'utf8')
      expect(content).to.contain('id = "herdr.hordr"')
      expect(content).to.contain('name =')
      expect(content).to.contain('version =')
      expect(content).to.contain('min_herdr_version =')
      expect(content).to.contain('description =')
    })

    it('declares exactly 10 actions', () => {
      const content = readFileSync(MANIFEST_PATH, 'utf8')
      expect(parseTomlCount(content, 'actions')).to.equal(10)
    })

    it('declares exactly 2 event hooks', () => {
      const content = readFileSync(MANIFEST_PATH, 'utf8')
      expect(parseTomlCount(content, 'events')).to.equal(2)
    })

    it('every action invokes the hordr binary', () => {
      const content = readFileSync(MANIFEST_PATH, 'utf8')
      // Every command line should start with "hordr".
      const commandLines = content.match(/command = \[.*?\]/g) ?? []
      expect(commandLines.length).to.equal(12) // 10 actions + 2 events
      for (const line of commandLines) {
        expect(line).to.match(/command = \["hordr",/)
      }
    })

    it('declares the two worktree event hooks', () => {
      const content = readFileSync(MANIFEST_PATH, 'utf8')
      expect(content).to.contain('on = "worktree.created"')
      expect(content).to.contain('command = ["hordr", "on-worktree-created"]')
      expect(content).to.contain('on = "worktree.removed"')
      expect(content).to.contain('command = ["hordr", "on-worktree-removed"]')
    })

    it('lists all 10 SPEC §5 commands as action ids', () => {
      const content = readFileSync(MANIFEST_PATH, 'utf8')
      const requiredActions = [
        'plan',
        'validate-spec',
        'approve',
        'run',
        'advance',
        'take',
        'status',
        'drain',
        'reset',
        'close-merged',
      ]
      for (const id of requiredActions) {
        expect(content).to.contain(`id = "${id}"`)
      }
    })

    // Live integration test: skip if herdr is not installed.
    // Run with `IT_HERDR=1 bun run test` to opt in.
    const herdrInstalled = (() => {
      try {
        execFileSync('sh', ['-c', 'command -v herdr'], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']})
        return true
      } catch {
        return false
      }
    })()

    describe('live herdr integration (skipped unless IT_HERDR=1)', function () {
      // Integration tests are slow + side-effectful.
      this.timeout(10_000)

      before(function () {
        if (!process.env.IT_HERDR || !herdrInstalled) this.skip()
      })

      it('herdr plugin link . succeeds', () => {
        execFileSync('herdr', ['plugin', 'link', '.'], {
          cwd: resolve(__dirname, '../..'),
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
        })
      })

      it('herdr plugin list --plugin herdr.hordr shows the plugin as enabled', () => {
        const out = execFileSync('herdr', ['plugin', 'list', '--plugin', 'herdr.hordr', '--json'], {
          encoding: 'utf8',
        })
        const data = JSON.parse(out) as {
          result: {plugins: Array<{enabled: boolean; plugin_id: string}>}
        }
        const plugin = data.result.plugins.find((p) => p.plugin_id === 'herdr.hordr')
        expect(plugin, 'plugin registered').to.exist
        expect(plugin?.enabled).to.equal(true)
      })

      it('herdr plugin action list --plugin herdr.hordr shows all 10 actions', () => {
        const out = execFileSync('herdr', ['plugin', 'action', 'list', '--plugin', 'herdr.hordr'], {
          encoding: 'utf8',
        })
        const data = JSON.parse(out) as {
          result: {actions: Array<{action_id: string; command: string[]}>}
        }
        expect(data.result.actions).to.have.length(10)
        for (const action of data.result.actions) {
          expect(action.command[0]).to.equal('hordr')
        }
      })
    })
  })

  describe('beanIdFromBranch helper', () => {
    it('extracts the bean id from a prefixed branch', () => {
      expect(beanIdFromBranch('bean/hordr-1234')).to.equal('hordr-1234')
    })

    it('honours a custom prefix', () => {
      expect(beanIdFromBranch('wt/hordr-1234', 'wt/')).to.equal('hordr-1234')
    })

    it('returns null for non-hordr branches', () => {
      expect(beanIdFromBranch('feature/foo')).to.be.null
      expect(beanIdFromBranch('develop')).to.be.null
      expect(beanIdFromBranch('main')).to.be.null
    })

    it('returns null when prefix matches but id is empty', () => {
      expect(beanIdFromBranch('bean/')).to.be.null
    })
  })
})
