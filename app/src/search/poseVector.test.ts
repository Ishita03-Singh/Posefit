import { describe, expect, it } from 'vitest'

import { TEMPLATES } from '../pose/template'
import { cosine, poseVector } from './poseVector'

// Same fixture and expected numbers as server/tests/test_pose_vector.py.
const SIMPLE = {
  left_shoulder: [0.4, -1.0],
  right_shoulder: [-0.4, -1.0],
  left_hip: [0.2, 0.0],
  right_hip: [-0.2, 0.0],
  nose: [0.0, -1.45],
  left_elbow: [0.4, -0.4],
  left_wrist: [0.4, 0.1],
  right_elbow: [-0.4, -1.6],
} as Record<string, [number, number]>
const S = 1 / Math.sqrt(5)
const SIMPLE_VECTOR = [0, -S, 0, -S, 0, S, 0, S, 0, -S, ...Array(10).fill(0)]

describe('poseVector (parity with the server)', () => {
  it('matches the shared fixture', () => {
    const v = poseVector(SIMPLE)
    expect(v).toHaveLength(20)
    v.forEach((x, i) => expect(x).toBeCloseTo(SIMPLE_VECTOR[i], 9))
  })

  it('ignores size and position', () => {
    const moved = Object.fromEntries(Object.entries(SIMPLE).map(([k, p]) => [k, [p[0] * 3 + 10, p[1] * 3 - 5]]))
    expect(cosine(poseVector(SIMPLE), poseVector(moved))).toBeCloseTo(1)
  })

  it('every starter pose is most similar to itself', () => {
    const vs = TEMPLATES.map((t) => [t.id, poseVector(t.keypoints)] as const)
    for (const [id, v] of vs) {
      const best = vs.reduce((a, b) => (cosine(v, b[1]) > cosine(v, a[1]) ? b : a))
      expect(best[0]).toBe(id)
    }
  })
})
