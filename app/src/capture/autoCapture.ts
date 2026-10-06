/**
 * Hands-free capture as an explicit state machine:
 *
 *   off ──arm──► aiming ──matched──► holding ──held long enough──► countdown ──► shooting ──► done
 *                  ▲                    │                              │
 *                  └──── lost match ────┴──────────────────────────────┘
 *
 * One armed round produces exactly one burst and then stops in `done`; the user re-arms
 * explicitly ("Shoot again"). That rules out the "keeps taking pictures" failure mode.
 */

export type CapturePhase = 'off' | 'aiming' | 'holding' | 'countdown' | 'shooting' | 'done'

export type CaptureState =
  | { phase: 'off' }
  | { phase: 'aiming' }
  | { phase: 'holding'; since: number }
  | { phase: 'countdown'; endsAt: number }
  | { phase: 'shooting'; taken: number; nextAt: number }
  | { phase: 'done' }

export interface CaptureConfig {
  holdMs: number
  countdownMs: number
  burst: number
  burstIntervalMs: number
}

export const DEFAULT_CAPTURE: CaptureConfig = {
  holdMs: 700,
  countdownMs: 3000,
  // Five frames give Best Shots enough to choose from (blinks, motion blur).
  burst: 5,
  burstIntervalMs: 200,
}

export interface StepResult {
  state: CaptureState
  /** True when a photo should be taken on this frame. */
  shoot: boolean
}

export const OFF: CaptureState = { phase: 'off' }
export const ARMED: CaptureState = { phase: 'aiming' }

export function step(
  state: CaptureState,
  now: number,
  matched: boolean,
  cfg: CaptureConfig = DEFAULT_CAPTURE,
): StepResult {
  switch (state.phase) {
    case 'off':
    case 'done':
      return { state, shoot: false }

    case 'aiming':
      return { state: matched ? { phase: 'holding', since: now } : state, shoot: false }

    case 'holding':
      if (!matched) return { state: ARMED, shoot: false }
      if (now - state.since >= cfg.holdMs) return { state: { phase: 'countdown', endsAt: now + cfg.countdownMs }, shoot: false }
      return { state, shoot: false }

    case 'countdown':
      if (!matched) return { state: ARMED, shoot: false }
      if (now >= state.endsAt) return { state: { phase: 'shooting', taken: 0, nextAt: now }, shoot: false }
      return { state, shoot: false }

    case 'shooting':
      // The burst completes even if the pose slips for a moment.
      if (now < state.nextAt) return { state, shoot: false }
      if (state.taken + 1 >= cfg.burst) return { state: { phase: 'done' }, shoot: true }
      return { state: { phase: 'shooting', taken: state.taken + 1, nextAt: now + cfg.burstIntervalMs }, shoot: true }
  }
}

/** Whole seconds left in a countdown, for display and speech (3, 2, 1). */
export function secondsLeft(state: CaptureState, now: number): number | null {
  return state.phase === 'countdown' ? Math.max(1, Math.ceil((state.endsAt - now) / 1000)) : null
}
