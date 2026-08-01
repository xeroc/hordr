import type {ActionResult} from './actions.js'

/** Last-action result. Shows the tail of stdout (ok) or stderr (fail). */
export function Toast({result}: {result: ActionResult}) {
  const source = result.ok ? result.stdout : result.stderr || result.stdout
  const body = source.split('\n').filter((line) => line.trim()).slice(-2).join(' · ')
  return (
    <box style={{border: true, padding: 1}}>
      <text fg={result.ok ? '#22aa22' : '#ff5555'}>
        {result.ok ? '✓' : '✗'} {body || (result.ok ? 'ok' : 'failed')}
      </text>
    </box>
  )
}
