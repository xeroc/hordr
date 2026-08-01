import {useKeyboard, useRenderer} from '@opentui/react'
import {useEffect, useState} from 'react'

import {type BeanRecord, getBean} from '../beans/client.js'
import {ActionMenu, MENU} from './action-menu.js'
import {type ActionResult, type FleetAction, fleetActionArgs, globalCheckArgs, runHordr} from './actions.js'
import {BeanDetail} from './bean-detail.js'
import {BeanTree} from './bean-tree-view.js'
import {defaultExpanded, flattenTree, isContainer} from './bean-tree.js'
import {Confirm} from './confirm.js'
import {FleetList} from './fleet-list.js'
import {Toast} from './toast.js'
import {useFleets} from './use-fleets.js'

type Mode = 'confirm' | 'list' | 'menu' | 'tree'

const BIN = 'hordr'
const DESTRUCTIVE: ReadonlySet<FleetAction> = new Set(['abort', 'finish'])

/**
 * Fleet-manager TUI root. The fleet list opens into a recursive bean tree
 * (milestone → epic → feature → task, every level) with a rich detail panel,
 * expand/collapse nav, and per-task actions — notably `o` to jump herdr into
 * the lane workspace running the bean's agent. Observer-only: `c` runs one
 * `hordr fleet check`; fleet actions shell out to the tested `hordr fleet` path.
 */
export function App() {
  const renderer = useRenderer()
  const {fleets, refresh, treesByMilestone} = useFleets()
  const [mode, setMode] = useState<Mode>('list')
  const [cursor, setCursor] = useState(0)
  const [treeCursor, setTreeCursor] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [menuCursor, setMenuCursor] = useState(0)
  const [milestone, setMilestone] = useState('')
  const [fleetTitle, setFleetTitle] = useState('')
  const [projectRoot, setProjectRoot] = useState('')
  const [returnMode, setReturnMode] = useState<Mode>('list')
  const [pending, setPending] = useState<FleetAction | null>(null)
  const [toast, setToast] = useState<ActionResult | null>(null)
  const [detail, setDetail] = useState<BeanRecord | null>(null)

  const tree = milestone ? (treesByMilestone.get(milestone) ?? null) : null
  const visible = tree ? flattenTree(tree, expanded) : []
  const selectedNode = visible[treeCursor]
  const selectedId = selectedNode?.bean.id

  // Fetch the selected bean's full record (body etc.) on demand — from the
  // worktree it lives in (status is per-worktree; the main repo is stale).
  const detailCwd = selectedNode?.worktreePath ?? projectRoot
  useEffect(() => {
    if (mode !== 'tree' || !selectedId || !detailCwd) {
      setDetail(null)
      return
    }

    try {
      setDetail(getBean(selectedId, {cwd: detailCwd}))
    } catch {
      setDetail(null)
    }
  }, [mode, selectedId, detailCwd])

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
      setMode(returnMode)
    }
  }

  const openMenu = (from: Mode) => {
    setReturnMode(from)
    setMenuCursor(0)
    setMode('menu')
  }

  const jumpToPane = () => {
    const workspaceId = selectedNode?.lane?.workspaceId
    if (!workspaceId) {
      setToast({ok: false, stderr: 'no herdr workspace for this bean', stdout: ''})
      return
    }

    runHordr('herdr', ['workspace', 'focus', workspaceId])
    renderer.destroy() // leave the TUI; user lands in the lane's workspace
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
            setMode(returnMode)
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
              openMenu('list')
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
              setProjectRoot(fleet.projectRoot)
              setTreeCursor(0)
              setExpanded(treesByMilestone.get(fleet.milestone) ? defaultExpanded(treesByMilestone.get(fleet.milestone)!) : new Set())
              setMode('tree')
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
            setMode(returnMode)
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
            setMode(returnMode)
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

      case 'tree': {
        switch (key.name) {
          case 'a': {
            openMenu('tree')
            break
          }

          case 'c': {
            setToast(runHordr(BIN, globalCheckArgs()))
            refresh()
            break
          }

          case 'down': {
            setTreeCursor((c) => Math.min(visible.length - 1, c + 1))
            break
          }

          case 'escape': {
            setMode('list')
            break
          }

          case 'j': {
            setTreeCursor((c) => Math.min(visible.length - 1, c + 1))
            break
          }

          case 'k': {
            setTreeCursor((c) => Math.max(0, c - 1))
            break
          }

          case 'left': {
            if (selectedNode && isContainer(selectedNode) && expanded.has(selectedNode.bean.id)) {
              setExpanded((prev) => {
                const next = new Set(prev)
                next.delete(selectedNode.bean.id)
                return next
              })
            }

            break
          }

          case 'o': {
            jumpToPane()
            break
          }

          case 'q': {
            setMode('list')
            break
          }

          case 'return': {
            if (selectedNode && isContainer(selectedNode)) {
              setExpanded((prev) => {
                const next = new Set(prev)
                if (next.has(selectedNode.bean.id)) {
                  next.delete(selectedNode.bean.id)
                } else {
                  next.add(selectedNode.bean.id)
                }

                return next
              })
            }

            break
          }

          case 'right': {
            if (selectedNode && isContainer(selectedNode)) {
              setExpanded((prev) => {
                if (prev.has(selectedNode.bean.id)) return prev
                const next = new Set(prev)
                next.add(selectedNode.bean.id)
                return next
              })
            }

            break
          }

          case 'up': {
            setTreeCursor((c) => Math.max(0, c - 1))
            break
          }

          default: {
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
      ? '↑/↓ select · enter view tree · a actions · c check · q quit'
      : mode === 'tree'
        ? '↑/↓ nav · →/← expand/collapse · enter toggle · o open pane · a actions · esc back'
        : mode === 'menu'
          ? '↑/↓ select · enter or s/r/f/a · esc back'
          : 'y confirm · n / esc cancel'

  return (
    <box style={{flexDirection: 'column', padding: 1}}>
      <text fg="#FFFF00">hordr — fleet manager</text>
      {mode === 'confirm' ? (
        <Confirm message={`Confirm ${pending} on ${milestone}?`} />
      ) : mode === 'tree' ? (
        <box style={{flexDirection: 'column'}}>
          <text fg="#888">{`${fleetTitle} (${milestone})`}</text>
          <BeanTree cursor={treeCursor} expanded={expanded} tree={tree} />
          <BeanDetail bean={detail} node={selectedNode} />
        </box>
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
