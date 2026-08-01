import type {FleetAction} from './actions.js'

export interface MenuEntry {
  action: FleetAction
  hint: string
  label: string
}

/** The per-fleet action menu. Order = display order; `hint` is the shortcut key. */
export const MENU: MenuEntry[] = [
  {action: 'status', hint: 's', label: 'status — show fleet + lanes'},
  {action: 'reset', hint: 'r', label: 'reset — recreate worktree + pane'},
  {action: 'finish', hint: 'f', label: 'finish — merge into primary + teardown'},
  {action: 'abort', hint: 'a', label: 'abort — tear down (keep work)'},
]

/** Action menu view. Pure presentation. */
export function ActionMenu({cursor, milestone}: {cursor: number; milestone: string}) {
  return (
    <box style={{border: true, flexDirection: 'column', padding: 1}}>
      <text fg="#FFFF00">{milestone}</text>
      {MENU.map((entry, i) => (
        <text fg={i === cursor ? '#00aaff' : undefined} key={entry.action}>
          {i === cursor ? '▸ ' : '  '}
          [{entry.hint}] {entry.label}
        </text>
      ))}
    </box>
  )
}
