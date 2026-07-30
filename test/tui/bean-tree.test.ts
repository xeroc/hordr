import {expect} from 'chai'

import {
  attachLanes,
  type BeanSummary,
  buildBeanTree,
  defaultExpanded,
  flattenTree,
  isContainer,
} from '../../src/tui/bean-tree.js'

const bean = (over: Partial<BeanSummary> & Pick<BeanSummary, 'id'>): BeanSummary => ({
  parent: undefined,
  priority: 'normal',
  status: 'todo',
  title: over.id,
  type: 'task',
  ...over,
})

// milestone → epic → feature → task (the 4-level hierarchy, no skips)
const BEANS: BeanSummary[] = [
  bean({id: 'ms', title: 'Ship it', type: 'milestone'}),
  bean({id: 'epic', parent: 'ms', title: 'Auth', type: 'epic'}),
  bean({id: 'feat', parent: 'epic', title: 'Login', type: 'feature'}),
  bean({id: 'task-a', parent: 'feat', title: 'Build form', type: 'task'}),
  bean({id: 'task-b', parent: 'epic', title: 'Wire API', type: 'task'}),
]

describe('tui/bean-tree', () => {
  it('buildBeanTree nests every level under the milestone', () => {
    const root = buildBeanTree(BEANS, 'ms')!
    expect(root.bean.id).to.equal('ms')
    expect(root.depth).to.equal(0)
    expect(root.children.map((c) => c.bean.id)).to.deep.equal(['epic'])
    expect(root.children[0]!.children.map((c) => c.bean.id)).to.deep.equal(['feat', 'task-b'])
    expect(root.children[0]!.children[0]!.children.map((c) => c.bean.id)).to.deep.equal(['task-a'])
    expect(root.children[0]!.depth).to.equal(1)
    expect(root.children[0]!.children[0]!.children[0]!.depth).to.equal(3)
  })

  it('buildBeanTree returns null when the milestone is absent', () => {
    expect(buildBeanTree(BEANS, 'nope')).to.equal(null)
  })

  it('attachLanes tags the epic and propagates the lane to descendants', () => {
    const root = buildBeanTree(BEANS, 'ms')!
    attachLanes(root, new Map([['epic', {agentActive: true, currentTask: 'task-a', laneStatus: 'active', workspaceId: 'ws-1'}]]))

    const epic = root.children[0]!
    expect(epic.lane?.workspaceId).to.equal('ws-1')
    const feat = epic.children[0]!
    const taskA = feat.children[0]!
    expect(taskA.lane?.workspaceId).to.equal('ws-1') // inherited from epic
    expect(taskA.isCurrentTask).to.equal(true) // lane.currentTask === task-a
    expect(epic.children[1]!.isCurrentTask).to.equal(false) // task-b not current
    expect(root.lane).to.equal(undefined) // milestone has no lane
  })

  it('flattenTree respects the expanded set (pre-order)', () => {
    const root = buildBeanTree(BEANS, 'ms')!
    // Only milestone expanded → just root + epics.
    expect(flattenTree(root, new Set(['ms'])).map((n) => n.bean.id)).to.deep.equal(['ms', 'epic'])
    // Expand epic too → its feature + direct task show, feature's task stays hidden.
    const expanded = new Set(['epic', 'ms'])
    expect(flattenTree(root, expanded).map((n) => n.bean.id)).to.deep.equal([
      'ms',
      'epic',
      'feat',
      'task-b',
    ])
    // Expand feature as well → task-a appears.
    expanded.add('feat')
    expect(flattenTree(root, expanded).map((n) => n.bean.id)).to.deep.equal([
      'ms',
      'epic',
      'feat',
      'task-a',
      'task-b',
    ])
  })

  it('isContainer flags milestone/epic/feature, not task', () => {
    const root = buildBeanTree(BEANS, 'ms')!
    const epic = root.children[0]!
    const feat = epic.children[0]!
    const task = feat.children[0]!
    expect(isContainer(root)).to.equal(true)
    expect(isContainer(epic)).to.equal(true)
    expect(isContainer(feat)).to.equal(true)
    expect(isContainer(task)).to.equal(false)
  })

  it('defaultExpanded opens the root only', () => {
    const root = buildBeanTree(BEANS, 'ms')!
    expect([...defaultExpanded(root)]).to.deep.equal(['ms'])
  })
})
