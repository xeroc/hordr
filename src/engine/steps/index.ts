import type {HordrConfig} from '../../config/schema.js'
import type {RunState} from '../../state/schema.js'
import type {EngineDeps, StepResult} from '../types.js'

import {cleanup} from './cleanup.js'
import {commit} from './commit.js'
import {draftSpec} from './draft-spec.js'
import {hitl} from './hitl.js'
import {implement} from './implement.js'
import {pr} from './pr.js'
import {review} from './review.js'
import {testStep} from './test.js'

// Re-export StepError here for callers; it is defined in shared.ts to break the
// runtime circular import (index → handlers → shared, index → shared).
export {StepError} from './shared.js'

// Reuse the config step type via indexed access (not a redefinition). The
// `flavor` field extends hitl steps with approve/external semantics that the
// config schema does not yet model; harmless intersection.
export type StepKind = HordrConfig['workflows'][string]['steps'][number]['kind']
export type StepConfig = HordrConfig['workflows'][string]['steps'][number] & {
  flavor?: 'approve' | 'external'
}

export type StepHandler = (run: RunState, step: StepConfig, deps: EngineDeps) => StepResult

export const STEP_HANDLERS: Record<StepKind, StepHandler> = {
  cleanup,
  commit,
  'draft-spec': draftSpec,
  hitl,
  implement,
  pr,
  review,
  test: testStep,
}
