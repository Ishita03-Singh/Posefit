import { mid, dist, type Vec } from './geometry'
import { type LandmarkName, LM, type Keypoint, VISIBILITY_THRESHOLD } from './landmarks'
import type { PoseTemplate } from './template'

/** Keypoints by name in pixel space; only confidently visible points are present. */
export type BodyPoints = Partial<Record<LandmarkName, Vec>>

// Matches tools/posefit_tools/template.py
export const HEAD_TO_TORSO = 0.45

export function toPixels(keypoints: Keypoint[], width: number, height: number): BodyPoints {
  const out: BodyPoints = {}
  for (const [name, i] of Object.entries(LM) as [LandmarkName, number][]) {
    const p = keypoints[i]
    if (p.visibility >= VISIBILITY_THRESHOLD) out[name] = [p.x * width, p.y * height]
  }
  return out
}

export interface Anchor {
  /** mid-hip (torso frame) or mid-shoulder (head frame) */
  origin: Vec
  /** Pixels per template unit (≈ torso length). */
  unit: number
}

/** Same reference frame as template normalization, computed on a live body. */
export function anchorFor(points: BodyPoints, frame: PoseTemplate['frame']): Anchor | null {
  const { left_shoulder: ls, right_shoulder: rs, left_hip: lh, right_hip: rh, nose } = points
  if (!ls || !rs) return null
  const midShoulder = mid(ls, rs)
  if (frame === 'torso') {
    if (!lh || !rh) return null
    const origin = mid(lh, rh)
    return { origin, unit: dist(midShoulder, origin) }
  }
  if (!nose) return null
  return { origin: midShoulder, unit: dist(nose, midShoulder) / HEAD_TO_TORSO }
}
