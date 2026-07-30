import {bold, fg, type TextChunk, type TextTableContent} from '@opentui/core'

import type {LaneItem} from './state.js'

const cell = (text: string): TextChunk[] => [{__isChunk: true, text}]

/**
 * Fleet detail: one row per child bean (lane/epic), showing its title, status,
 * current task, and whether an agent is actively working in its worktree pane.
 */
export function FleetDetail({lanes, milestone, title}: {lanes: LaneItem[]; milestone: string; title: string}) {
  const rows: TextTableContent = [
    [[bold('Bean')], [bold('Status')], [bold('Task')], [bold('Agent')]],
    ...(lanes.length > 0
      ? lanes.map((lane) => [
          cell(lane.title),
          cell(lane.status),
          cell(lane.currentTask ?? '—'),
          lane.agentActive ? [fg('#22aa22')('● active')] : [fg('#888')('○ idle')],
        ])
      : [[cell('no lanes yet — daemon creates them as epics unblock')]]),
  ]

  return (
    <box style={{flexDirection: 'column'}}>
      <text fg="#FFFF00">{title}</text>
      <text fg="#888">{milestone}</text>
      <textTable borderStyle="rounded" columnWidthMode="content" content={rows} style={{width: '100%'}} />
    </box>
  )
}
