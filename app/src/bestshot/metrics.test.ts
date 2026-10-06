import { describe, expect, it } from 'vitest'

import type { BodyPoints } from '../pose/body'
import { BLUR_THRESHOLD, exposure, framingScore, laplacianVariance, rankBurst, type ShotSignals, toGray } from './metrics'

const W = 64
const H = 64

function checkerboard(cell: number): Float32Array {
  const g = new Float32Array(W * H)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g[y * W + x] = (Math.floor(x / cell) + Math.floor(y / cell)) % 2
  return g
}

function boxBlur(g: Float32Array, r: number): Float32Array {
  const out = new Float32Array(g.length)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let s = 0
      let n = 0
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) {
            s += g[yy * W + xx]
            n++
          }
        }
      out[y * W + x] = s / n
    }
  return out
}

describe('image metrics', () => {
  it('blur lowers the Laplacian variance below the threshold', () => {
    const sharp = checkerboard(4)
    const blurry = boxBlur(sharp, 3)
    expect(laplacianVariance(sharp, W, H)).toBeGreaterThan(BLUR_THRESHOLD * 10)
    expect(laplacianVariance(blurry, W, H)).toBeLessThan(laplacianVariance(sharp, W, H) / 10)
    expect(laplacianVariance(new Float32Array(W * H).fill(0.5), W, H)).toBe(0)
  })

  it('converts RGBA to luminance', () => {
    const rgba = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255])
    expect(Array.from(toGray(rgba, 2, 1))).toEqual([1, 0])
  })

  it('measures exposure and clipping', () => {
    const e = exposure(new Float32Array([0, 0, 1, 0.5]))
    expect(e.mean).toBeCloseTo(0.375)
    expect(e.dark).toBeCloseTo(0.5)
    expect(e.bright).toBeCloseTo(0.25)
  })

  it('rewards a person fully in frame and centred', () => {
    const centred: BodyPoints = { nose: [50, 20], left_ankle: [55, 90], right_ankle: [45, 90] }
    const cut: BodyPoints = { nose: [95, 20], left_ankle: [101, 90], right_ankle: [99, 99.5] }
    expect(framingScore(centred, 100, 100)).toBeCloseTo(1)
    expect(framingScore(cut, 100, 100)).toBeLessThan(0.5)
  })
})

const good: ShotSignals = {
  pose: 90,
  eyes: 'open',
  smile: 0.6,
  sharpness: 300,
  exposure: { mean: 0.5, dark: 0.01, bright: 0.01 },
  framing: 1,
}

describe('rankBurst', () => {
  it('a blink loses to an otherwise identical open-eyed shot', () => {
    const [open, blink] = rankBurst([good, { ...good, eyes: 'closed' }])
    expect(open.total).toBeGreaterThan(blink.total)
    expect(blink.notes.map((n) => n.text)).toContain('Eyes closed')
  })

  it('the sharpest frame wins when everything else is equal', () => {
    const [soft, crisp] = rankBurst([{ ...good, sharpness: 150 }, good])
    expect(crisp.total).toBeGreaterThan(soft.total)
    expect(crisp.notes.map((n) => n.text)).toContain('Sharpest')
  })

  it('a better pose can outweigh a slightly softer frame', () => {
    const [okPose, greatPose] = rankBurst([{ ...good, pose: 70 }, { ...good, pose: 95, sharpness: 270 }])
    expect(greatPose.total).toBeGreaterThan(okPose.total)
  })

  it('flags blur, darkness and cropping', () => {
    const [bad] = rankBurst([{ ...good, sharpness: 10, exposure: { mean: 0.1, dark: 0.4, bright: 0 }, framing: 0.5 }])
    expect(bad.notes.map((n) => n.text)).toEqual(expect.arrayContaining(['Blurry', 'Too dark', 'Partly out of frame']))
  })

  it('unknown eyes (no face found) are neutral, not a failure', () => {
    const [unknown, closed] = rankBurst([{ ...good, eyes: null }, { ...good, eyes: 'closed' }])
    expect(unknown.total).toBeGreaterThan(closed.total)
  })
})

describe('framing without a person', () => {
  it('is unknown rather than a cropping warning', () => {
    expect(framingScore(null, 100, 100)).toBeNull()
    const [s] = rankBurst([{ ...good, framing: null }])
    expect(s.notes.map((n) => n.text)).not.toContain('Partly out of frame')
  })
})
