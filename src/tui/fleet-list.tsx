import {bold, fg, type TextChunk, type TextTableContent} from '@opentui/core'

import type {FleetListItem} from './state.js'

const cell = (text: string): TextChunk[] => [{__isChunk: true, text}]

/** Fleet list as a TextTable. Each row carries the fleet's bean title. */
export function FleetList({cursor, items}: {cursor: number; items: FleetListItem[]}) {
  if (items.length === 0) {
    return <text fg="#888">No fleets. Press q to quit.</text>
  }

  const rows: TextTableContent = [
    [[bold('Bean')], [bold('Status')], [bold('Lanes')], [bold('Project')]],
    ...items.map((item, i) => {
      const selected = i === cursor
      const name = `${selected ? '▸ ' : ''}${item.title}`
      return [
        selected ? [fg('#00aaff')(name)] : cell(name),
        cell(item.status),
        cell(`${item.laneCount} lane${item.laneCount === 1 ? '' : 's'}`),
        cell(item.projectKey),
      ]
    }),
  ]

  return <textTable borderStyle="rounded" columnWidthMode="content" content={rows} style={{width: '100%'}} />
}
