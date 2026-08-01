import {TextTableRenderable} from '@opentui/core'
import {extend} from '@opentui/react'

/**
 * TextTable is an imperative renderable — OpenTUI does not register it as a
 * built-in React component. Register it once here so `<textTable>` is usable
 * in JSX. Imported by boot.ts for its side effect before the app renders.
 */
declare module '@opentui/react' {
  interface OpenTUIComponents {
    textTable: typeof TextTableRenderable
  }
}

extend({textTable: TextTableRenderable})
