// Pose-shape vectors; must stay identical to server/app/search/pose_vector.py
// (both test suites check the same fixture). Only these numbers are sent for photo search.

import type { Vec } from '../pose/geometry'
import type { PoseTemplate } from '../pose/template'

type Keypoints = PoseTemplate['keypoints']

export const BONES: [string, string][] = [
  ['mid_hip', 'mid_shoulder'],
  ['mid_shoulder', 'nose'],
  ['left_shoulder', 'left_elbow'],
  ['left_elbow', 'left_wrist'],
  ['right_shoulder', 'right_elbow'],
  ['right_elbow', 'right_wrist'],
  ['left_hip', 'left_knee'],
  ['left_knee', 'left_ankle'],
  ['right_hip', 'right_knee'],
  ['right_knee', 'right_ankle'],
]

function get(kp: Keypoints, name: string): Vec | undefined {
  if (name.startsWith('mid_')) {
    const part = name.slice(4)
    const a = kp[`left_${part}` as keyof Keypoints]
    const b = kp[`right_${part}` as keyof Keypoints]
    return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : undefined
  }
  return kp[name as keyof Keypoints]
}

export function poseVector(kp: Keypoints): number[] {
  const out: number[] = []
  for (const [a, b] of BONES) {
    const pa = get(kp, a)
    const pb = get(kp, b)
    if (!pa || !pb) {
      out.push(0, 0)
      continue
    }
    const dx = pb[0] - pa[0]
    const dy = pb[1] - pa[1]
    const n = Math.hypot(dx, dy)
    out.push(n > 1e-9 ? dx / n : 0, n > 1e-9 ? dy / n : 0)
  }
  const total = Math.hypot(...out)
  return total > 0 ? out.map((v) => v / total) : out
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0
}
