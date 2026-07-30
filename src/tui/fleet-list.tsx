import type {FleetListItem} from './state.js'

/** Fleet list view. Pure presentation — App owns the cursor + keyboard. */
export function FleetList({cursor, items}: {cursor: number; items: FleetListItem[]}) {
  if (items.length === 0) {
    return <text fg="#888">No fleets. Press q to quit.</text>
  }

  return (
    <box style={{flexDirection: 'column'}}>
      {items.map((item, i) => {
        const selected = i === cursor
        const laneWord = `${item.laneCount} lane${item.laneCount === 1 ? '' : 's'}`
        return (
          <text fg={selected ? '#ffffff' : undefined} key={item.milestone}>
            {selected ? '▸ ' : '  '}
            {item.status} · {item.milestone} · {laneWord} · {item.projectKey}
          </text>
        )
      })}
    </box>
  )
}
