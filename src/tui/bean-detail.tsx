import type {BeanRecord} from '../beans/client.js'
import type {TreeNode} from './bean-tree.js'

const STATUS_FG: Record<string, string> = {
  completed: '#22aa22',
  'in-progress': '#00aaff',
  scrapped: '#888',
  todo: '#ccc',
}

/** Rich detail panel for the selected bean: metadata, lane context, body excerpt. */
export function BeanDetail({bean, node}: {bean: BeanRecord | null; node: TreeNode | undefined}) {
  if (!bean) {
    return <text fg="#888">Select a bean.</text>
  }

  const body = (bean.body ?? '')
    .split('\n')
    .slice(0, 10)
    .join('\n')
    .trim()
  const lane = node?.lane
  const statusFg = STATUS_FG[String(bean.status ?? '')] ?? '#ccc'

  return (
    <box style={{border: true, flexDirection: 'column', padding: 1}}>
      <text fg="#FFFF00">{String(bean.title ?? bean.id)}</text>
      <text fg="#888">
        {`${String(bean.id)} · ${String(bean.type)} · ${String(bean.priority ?? '')}`}
      </text>
      <text fg={statusFg}>{String(bean.status ?? '')}</text>
      {lane ? (
        <text fg="#888">
          {`lane ${lane.laneStatus} · ws ${lane.workspaceId ?? '-'} · pane ${lane.paneId ?? '-'} · ${lane.agentActive ? '● agent active' : '○ idle'}`}
        </text>
      ) : null}
      {body ? <text fg="#ccc">{body}</text> : null}
    </box>
  )
}
