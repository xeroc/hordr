/** Confirmation prompt for destructive actions (finish / abort). Pure view. */
export function Confirm({message}: {message: string}) {
  return (
    <box style={{border: true, flexDirection: 'column', padding: 1}}>
      <text fg="#ff8800">{message}</text>
      <text fg="#888">y confirm · n / esc cancel</text>
    </box>
  )
}
