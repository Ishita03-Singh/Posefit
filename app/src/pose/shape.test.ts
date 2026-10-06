import { describe, expect, it } from 'vitest'

import type { BodyPoints } from './body'
import { DEFAULT_SHAPE, type MaskView, measure, ShapeScanner } from './shape'

const W = 400
const H = 800

/** Synthetic person mask: a torso rectangle and a separate vertical left upper arm. */
function makeMask(opts: { torsoHalf: number; armRadius: number; armGap: number }): { mask: MaskView; points: BodyPoints } {
  const data = new Float32Array(W * H)
  const cx = 200
  const top = 200
  const torso = 200 // torso length in px: shoulders at y=200, hips at y=400
  const fill = (x0: number, x1: number, y0: number, y1: number) => {
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++)
      for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) data[y * W + x] = 1
  }
  fill(cx - opts.torsoHalf, cx + opts.torsoHalf, top - 10, top + torso + 40)
  const armX = cx + opts.torsoHalf + opts.armGap + opts.armRadius
  fill(armX - opts.armRadius, armX + opts.armRadius, top, top + 130)

  const points: BodyPoints = {
    left_shoulder: [cx + 70, top],
    right_shoulder: [cx - 70, top],
    left_hip: [cx + 40, top + torso],
    right_hip: [cx - 40, top + torso],
    left_elbow: [armX, top + 120],
  }
  return { mask: { data, width: W, height: H }, points }
}

describe('measure', () => {
  it('recovers torso half-width and limb radius in torso units', () => {
    const { mask, points } = makeMask({ torsoHalf: 80, armRadius: 15, armGap: 20 })
    const s = measure(mask, points, W, H)!
    expect(s['torso.chest']).toBeCloseTo(80 / 200, 1)
    expect(s['torso.waist']).toBeCloseTo(80 / 200, 1)
    // Upper arm samples start at the shoulder joint, which is inside the torso here, so only
    // the lower sample is a clean arm measurement.
    expect(s['upperArm.1.left']).toBeCloseTo(15 / 200, 1)
  })

  it('works on a downscaled mask (mask smaller than the video frame)', () => {
    const { mask, points } = makeMask({ torsoHalf: 80, armRadius: 15, armGap: 20 })
    // Take every other pixel: a 200x400 mask for the 400x800 frame.
    const small = new Float32Array((W / 2) * (H / 2))
    for (let y = 0; y < H / 2; y++) for (let x = 0; x < W / 2; x++) small[y * (W / 2) + x] = mask.data[2 * y * W + 2 * x]
    const s = measure({ data: small, width: W / 2, height: H / 2 }, points, W, H)!
    expect(s['torso.chest']).toBeCloseTo(0.4, 1)
  })

  it('does not count an arm resting against the torso as torso width', () => {
    const { mask, points } = makeMask({ torsoHalf: 80, armRadius: 15, armGap: 0 })
    const s = measure(mask, points, W, H)!
    // Touching arm: the chest edge runs into the arm, so that sample reads wider than the torso.
    // The scan only samples in the A-pose (arms apart) for exactly this reason.
    expect(s['torso.chest']).toBeGreaterThan(0.4)
  })
})

describe('ShapeScanner', () => {
  it('takes medians, pools left/right, and falls back to defaults', () => {
    const scanner = new ShapeScanner(6)
    for (let i = 0; i < 6; i++) {
      scanner.add({ 'torso.waist': 0.3 + (i === 5 ? 0.5 : 0), 'thigh.0.left': 0.16, 'thigh.0.right': 0.18 })
    }
    expect(scanner.progress).toBe(1)
    const shape = scanner.result()
    expect(shape.torso.waist).toBeCloseTo(0.3) // outlier ignored by the median
    expect(shape.thigh[0]).toBeCloseTo(0.17)
    expect(shape.torso.chest).toBe(DEFAULT_SHAPE.torso.chest)
  })
})
