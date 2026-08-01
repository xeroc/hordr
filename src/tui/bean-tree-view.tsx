import {bold, fg, type TextChunk, type TextTableContent} from '@opentui/core'

import {flattenTree, isContainer, type TreeNode} from './bean-tree.js'

const cell = (text: string): TextChunk[] => [{__isChunk: true, text}]
const TYPE_GLYPH: Record<string, string> = {epic: 'E', feature: 'F', milestone: 'M', task: 'T'}

/**
 * Recursive bean-tree view. Renders the expanded rows as a TextTable: an
 * indented Bean column (with expand/collapse + type glyphs), then type, status,
 * priority, and an agent column (● when its lane has a live agent, ◀ when it's
 * the lane's current task). The app owns `expanded` and the `cursor` index into
 * the flattened row list.
 */
export function BeanTree({
  cursor,
  expanded,
  tree,
}: {
  cursor: number
  expanded: ReadonlySet<string>
  tree: null | TreeNode
}) {
  if (!tree) {
    return <text fg="#888">No bean tree for this fleet (no project root or beans unavailable).</text>
  }

  const rows = flattenTree(tree, expanded)
  const content: TextTableContent = [
    [[bold('Bean')], [bold('Type')], [bold('Status')], [bold('Pri')], [bold('Agent')]],
    ...rows.map((node, i) => {
      const selected = i === cursor
      const isOpen = expanded.has(node.bean.id)
      const marker = isContainer(node) ? (isOpen ? '▾' : '▸') : ' '
      const glyph = TYPE_GLYPH[node.bean.type] ?? '·'
      const label = `${'  '.repeat(node.depth)}${marker} ${glyph} ${node.bean.title}`
      const agent = node.lane?.agentActive ? '●' : ''
      const current = node.isCurrentTask ? ' ◀' : ''
      return [
        selected ? [fg('#00aaff')(label)] : cell(label),
        cell(node.bean.type),
        cell(node.bean.status),
        cell(node.bean.priority),
        cell(`${agent}${current}`),
      ]
    }),
  ]

  return <textTable borderStyle="rounded" columnWidthMode="content" content={content} style={{width: '100%'}} />
}
