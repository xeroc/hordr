import {useKeyboard, useRenderer} from '@opentui/react'
import {useState} from 'react'

import {ActionMenu, MENU} from './action-menu.js'
import {type ActionResult, type FleetAction, fleetActionArgs, globalCheckArgs, runHordr} from './actions.js'
import {Confirm} from './confirm.js'
import {FleetDetail} from './fleet-detail.js'
import {FleetList} from './fleet-list.js'
import {Toast} from './toast.js'
import {useFleets} from './use-fleets.js'

type Mode = 'confirm' | 'detail' | 'list' | 'menu'

const BIN = 'hordr'
const DESTRUCTIVE: ReadonlySet<FleetAction> = new Set(['abort', 'finish'])

/**
 * Fleet-manager TUI root. Owns all state + keyboard routing; child components
 * are pure views. Observer-only — it never advances fleets itself; `c` shells
 * out to one `hordr fleet check`, and per-fleet actions shell out to the
 * matching `hordr fleet <cmd>` so the tested command paths do the real work.
 */
export function App() {
  const renderer = useRenderer()
  const {fleets, lanesByMilestone, refresh} = useFleets()
  const [mode, setMode] = useState<Mode>('list')
  const [cursor, setCursor] = useState(0)
  const [menuCursor, setMenuCursor] = useState(0)
  const [milestone, setMilestone] = useState('')
  const [fleetTitle, setFleetTitle] = useState('')
  const [pending, setPending] = useState<FleetAction | null>(null)
  const [toast, setToast] = useState<ActionResult | null>(null)

  const lanes = milestone ? (lanesByMilestone.get(milestone) ?? []) : []

  const runAction = (action: FleetAction, ms: string, force = false) => {
    setToast(runHordr(BIN, fleetActionArgs(action, ms, {force})))
    refresh()
  }

  const trigger = (action: FleetAction) => {
    if (DESTRUCTIVE.has(action)) {
      setPending(action)
      setMode('confirm')
    } else {
      runAction(action, milestone)
      setMode('detail')
    }
  }

  const openMenu = () => {
    setMenuCursor(0)
    setMode('menu')
  }

  useKeyboard((key) => {
    switch (mode) {
      case 'confirm': {
        switch (key.name) {
          case 'escape': {
            setPending(null)
            setMode('menu')
            break
          }

          case 'n': {
            setPending(null)
            setMode('menu')
            break
          }

          case 'y': {
            if (pending) runAction(pending, milestone)
            setPending(null)
            setMode('detail')
            break
          }

          default: {
            break
          }
        }

        break
      }

      case 'detail': {
        switch (key.name) {
          case 'a': {
            openMenu()
            break
          }

          case 'escape': {
            setMode('list')
            break
          }

          case 'q': {
            setMode('list')
            break
          }

          default: {
            break
          }
        }

        break
      }

      case 'list': {
        switch (key.name) {
          case 'a': {
            const fleet = fleets[cursor]
            if (fleet) {
              setMilestone(fleet.milestone)
              setFleetTitle(fleet.title)
              openMenu()
            }

            break
          }

          case 'c': {
            setToast(runHordr(BIN, globalCheckArgs()))
            refresh()
            break
          }

          case 'down': {
            setCursor((c) => Math.min(fleets.length - 1, c + 1))
            break
          }

          case 'escape': {
            renderer.destroy()
            break
          }

          case 'j': {
            setCursor((c) => Math.min(fleets.length - 1, c + 1))
            break
          }

          case 'k': {
            setCursor((c) => Math.max(0, c - 1))
            break
          }

          case 'q': {
            renderer.destroy()
            break
          }

          case 'return': {
            const fleet = fleets[cursor]
            if (fleet) {
              setMilestone(fleet.milestone)
              setFleetTitle(fleet.title)
              setMode('detail')
            }

            break
          }

          case 'up': {
            setCursor((c) => Math.max(0, c - 1))
            break
          }

          default: {
            break
          }
        }

        break
      }

      case 'menu': {
        switch (key.name) {
          case 'down': {
            setMenuCursor((c) => Math.min(MENU.length - 1, c + 1))
            break
          }

          case 'escape': {
            setMode('list')
            break
          }

          case 'j': {
            setMenuCursor((c) => Math.min(MENU.length - 1, c + 1))
            break
          }

          case 'k': {
            setMenuCursor((c) => Math.max(0, c - 1))
            break
          }

          case 'q': {
            setMode('list')
            break
          }

          case 'return': {
            trigger(MENU[menuCursor]!.action)
            break
          }

          default: {
            const byHint = MENU.find((entry) => entry.hint === key.name)
            if (byHint) trigger(byHint.action)
            break
          }
        }

        break
      }

      default: {
        break
      }
    }
  })

  const footer =
    mode === 'list'
      ? '↑/↓ (or j/k) select · enter view · a actions · c check · q quit'
      : mode === 'detail'
        ? 'a actions · esc back'
        : mode === 'menu'
          ? '↑/↓ select · enter or s/r/f/a · esc back'
          : 'y confirm · n / esc cancel'

  return (
    <box style={{flexDirection: 'column', padding: 1}}>
      <text fg="#FFFF00">hordr — fleet manager</text>
      {mode === 'confirm' ? (
        <Confirm message={`Confirm ${pending} on ${milestone}?`} />
      ) : mode === 'detail' ? (
        <FleetDetail lanes={lanes} milestone={milestone} title={fleetTitle} />
      ) : mode === 'menu' ? (
        <ActionMenu cursor={menuCursor} milestone={milestone} />
      ) : (
        <FleetList cursor={cursor} items={fleets} />
      )}
      {toast ? <Toast result={toast} /> : null}
      <text fg="#888">{footer}</text>
    </box>
  )
}
