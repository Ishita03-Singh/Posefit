import { describe, expect, it } from 'vitest'

import { ARMED, type CaptureState, DEFAULT_CAPTURE as cfg, OFF, secondsLeft, step } from './autoCapture'

/** Runs frames every 33ms with a given matched() function; returns final state and shot times. */
function run(start: CaptureState, ms: number, matched: (t: number) => boolean) {
  let state = start
  const shots: number[] = []
  for (let t = 0; t <= ms; t += 33) {
    const r = step(state, t, matched(t))
    state = r.state
    if (r.shoot) shots.push(t)
  }
  return { state, shots }
}

describe('auto capture', () => {
  it('does nothing while off', () => {
    expect(run(OFF, 10_000, () => true).shots).toHaveLength(0)
  })

  it('holds, counts down, takes exactly one burst, then stops', () => {
    const { state, shots } = run(ARMED, 15_000, () => true)
    expect(shots).toHaveLength(cfg.burst)
    expect(state.phase).toBe('done')
    expect(shots[0]).toBeGreaterThanOrEqual(cfg.holdMs + cfg.countdownMs)
  })

  it('cancels the countdown when the pose is lost', () => {
    const lostAt = cfg.holdMs + 1000
    const { state, shots } = run(ARMED, cfg.holdMs + cfg.countdownMs + 500, (t) => t < lostAt)
    expect(shots).toHaveLength(0)
    expect(state.phase).toBe('aiming')
  })

  it('counts down 3, 2, 1', () => {
    const state: CaptureState = { phase: 'countdown', endsAt: 3000 }
    expect([0, 1500, 2500, 2999].map((t) => secondsLeft(state, t))).toEqual([3, 2, 1, 1])
  })
})
