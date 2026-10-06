import { clamp, dist, mid } from './geometry'
import type { BodyPoints } from './body'
import type { LandmarkName } from './landmarks'

// Average proportions in torso lengths; must match tools/posefit_tools/skeleton.py.
export const STANDARD = {
  shoulderWidth: 0.78,
  hipWidth: 0.42,
  upperArm: 0.62,
  forearm: 0.55,
  thigh: 0.88,
  shin: 0.82,
} as const

export type Segment = keyof typeof STANDARD

const SEGMENTS: Record<Segment, [LandmarkName, LandmarkName][]> = {
  shoulderWidth: [['left_shoulder', 'right_shoulder']],
  hipWidth: [['left_hip', 'right_hip']],
  upperArm: [
    ['left_shoulder', 'left_elbow'],
    ['right_shoulder', 'right_elbow'],
  ],
  forearm: [
    ['left_elbow', 'left_wrist'],
    ['right_elbow', 'right_wrist'],
  ],
  thigh: [
    ['left_hip', 'left_knee'],
    ['right_hip', 'right_knee'],
  ],
  shin: [
    ['left_knee', 'left_ankle'],
    ['right_knee', 'right_ankle'],
  ],
}

/**
 * Running estimate of the person's body proportions (segment length / torso length).
 *
 * A limb pointing toward the camera looks shorter than it is, never longer, so the estimate
 * rises quickly toward longer observations and decays only slowly toward shorter ones.
 */
export class BodyProfile {
  private ratios: Partial<Record<Segment, number>> = {}

  update(points: BodyPoints): void {
    const { left_shoulder: ls, right_shoulder: rs, left_hip: lh, right_hip: rh } = points
    if (!ls || !rs || !lh || !rh) return
    const torso = dist(mid(ls, rs), mid(lh, rh))
    if (torso < 1) return

    for (const [segment, pairs] of Object.entries(SEGMENTS) as [Segment, [LandmarkName, LandmarkName][]][]) {
      for (const [a, b] of pairs) {
        const pa = points[a]
        const pb = points[b]
        if (!pa || !pb) continue
        const observed = dist(pa, pb) / torso
        const current = this.ratios[segment]
        if (current === undefined) this.ratios[segment] = observed
        else this.ratios[segment] = current + (observed - current) * (observed > current ? 0.15 : 0.01)
      }
    }
  }

  /** How much longer (>1) or shorter (<1) this person's segment is than average. */
  factor(segment: Segment): number {
    const r = this.ratios[segment]
    return r === undefined ? 1 : clamp(r / STANDARD[segment], 0.75, 1.3)
  }

  reset(): void {
    this.ratios = {}
  }
}
