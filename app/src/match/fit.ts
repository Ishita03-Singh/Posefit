import type { Anchor, BodyPoints } from '../pose/body'
import { add, scale, sub, type Vec } from '../pose/geometry'
import type { LandmarkName } from '../pose/landmarks'
import type { BodyProfile, Segment } from '../pose/profile'
import type { PoseTemplate, Shot } from '../pose/template'

export interface Ghost {
  /** Template keypoints placed in video pixel space. */
  points: BodyPoints
  /** Where the template's origin sits and how many pixels one template unit spans. */
  anchor: Anchor
}

/** Swaps the template's left and right (do the pose on the other side). */
export function flipTemplate(t: PoseTemplate): PoseTemplate {
  const swap = (name: LandmarkName): LandmarkName =>
    (name.startsWith('left_') ? name.replace('left_', 'right_') : name.replace('right_', 'left_')) as LandmarkName
  const keypoints: PoseTemplate['keypoints'] = {}
  for (const [name, p] of Object.entries(t.keypoints) as [LandmarkName, Vec][]) {
    keypoints[swap(name)] = [-p[0], p[1]]
  }
  return { ...t, keypoints, key_joints: t.key_joints.map(swap) }
}

/** Stretches the template's limbs to this person's proportions, keeping every joint angle. */
export function retarget(t: PoseTemplate, profile: BodyProfile): PoseTemplate['keypoints'] {
  const src = t.keypoints
  const out: PoseTemplate['keypoints'] = { ...src }

  const widen = (a: LandmarkName, b: LandmarkName, segment: Segment) => {
    const pa = src[a]
    const pb = src[b]
    if (!pa || !pb) return
    const center = scale(add(pa, pb), 0.5)
    const k = profile.factor(segment)
    out[a] = add(center, scale(sub(pa, center), k))
    out[b] = add(center, scale(sub(pb, center), k))
  }
  // Moves `child` so it keeps its direction from `parent` with the segment length rescaled.
  const extend = (parent: LandmarkName, child: LandmarkName, segment: Segment | null) => {
    const p0 = src[parent]
    const c0 = src[child]
    const p1 = out[parent]
    if (!p0 || !c0 || !p1) return
    out[child] = add(p1, scale(sub(c0, p0), segment ? profile.factor(segment) : 1))
  }

  widen('left_shoulder', 'right_shoulder', 'shoulderWidth')
  widen('left_hip', 'right_hip', 'hipWidth')
  for (const side of ['left', 'right'] as const) {
    extend(`${side}_shoulder`, `${side}_elbow`, 'upperArm')
    extend(`${side}_elbow`, `${side}_wrist`, 'forearm')
    extend(`${side}_hip`, `${side}_knee`, 'thigh')
    extend(`${side}_knee`, `${side}_ankle`, 'shin')
    extend(`${side}_ankle`, `${side}_heel`, null)
    extend(`${side}_ankle`, `${side}_foot_index`, null)
  }
  return out
}

/** Target framing per shot type: fraction of frame height the figure fills, and its top margin. */
const LAYOUT: Record<Shot, { height: number; top: number }> = {
  full_body: { height: 0.8, top: 0.08 },
  half_body: { height: 0.66, top: 0.1 },
  selfie: { height: 0.55, top: 0.14 },
}

/** Room above the nose for the top of the head, in template units. */
const HEAD_ROOM = 0.3

/** Places a (retargeted) template in the frame with good composition. */
export function placeGhost(
  template: PoseTemplate,
  keypoints: PoseTemplate['keypoints'],
  width: number,
  height: number,
): Ghost {
  const pts = Object.values(keypoints) as Vec[]
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  if (keypoints.nose) ys.push(keypoints.nose[1] - HEAD_ROOM)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)

  const layout = LAYOUT[template.shot]
  const s = Math.min((layout.height * height) / (maxY - minY), (0.9 * width) / Math.max(maxX - minX, 1e-6))
  const cx = (minX + maxX) / 2
  const toPx = (p: Vec): Vec => [width / 2 + (p[0] - cx) * s, layout.top * height + (p[1] - minY) * s]

  const points: BodyPoints = {}
  for (const [name, p] of Object.entries(keypoints) as [LandmarkName, Vec][]) points[name] = toPx(p)
  return { points, anchor: { origin: toPx([0, 0]), unit: s } }
}
