import {createCliRenderer} from '@opentui/core'
import {createRoot} from '@opentui/react'
import {createElement as h} from 'react'

import {App} from './app.js'

/**
 * Boot the fleet TUI renderer. This module imports OpenTUI's native renderer,
 * so it MUST stay out of the node/oclif-help/mocha path — the `hordr tui`
 * command imports it lazily only after the runtime guard passes.
 */
export async function bootTui(): Promise<void> {
  const renderer = await createCliRenderer({exitOnCtrlC: true, screenMode: 'alternate-screen'})
  createRoot(renderer).render(h(App))
}
