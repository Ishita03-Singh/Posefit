import { anchorFor, type BodyPoints } from '../pose/body'
import { angleDiff, angleOf, add, dist, mid, scale, sub, type Vec } from '../pose/geometry'
import type { LandmarkName } from '../pose/landmarks'
import type { PoseTemplate } from '../pose/template'
import type { Ghost } from './fit'

type JointRef = LandmarkName | 'mid_hip' | 'mid_shoulder'
type Part = 'torso' | 'head' | 'elbow' | 'hand' | 'knee' | 'foot'

export interface ScoredBone {
  from: JointRef
  to: JointRef
  part: Part
  side?: 'left' | 'right'
}

/** Bones whose direction is compared. Direction (not position) makes scoring proportion-independent. */
export const SCORED_BONES: ScoredBone[] = [
  { from: 'mid_hip', to: 'mid_shoulder', part: 'torso' },
  { from: 'mid_shoulder', to: 'nose', part: 'head' },
  ...(['left', 'right'] as const).flatMap((side): ScoredBone[] => [
    { from: `${side}_shoulder`, to: `${side}_elbow`, part: 'elbow', side },
    { from: `${side}_elbow`, to: `${side}_wrist`, part: 'hand', side },
    { from: `${side}_hip`, to: `${side}_knee`, part: 'knee', side },
    { from: `${side}_knee`, to: `${side}_ankle`, part: 'foot', side },
  ]),
]

const BASE_WEIGHT: Record<Part, number> = { torso: 1.5, head: 0.5, elbow: 1, hand: 1, knee: 1, foot: 1 }
const KEY_JOINT_WEIGHT = 2.5
/** Angle error (degrees) at which a bone's score falls to ~37%. */
const ANGLE_TOLERANCE = 35
const HINT_BELOW = 0.75

export interface Placement {
  /** Person's size / ghost size: <1 too far, >1 too close. */
  ratio: number
  /** Person's offset from the ghost in ghost torso units (raw image axes). */
  dx: number
  dy: number
}

export interface Tolerance {
  ratio: number
  dx: number
  dy: number
}

export const TIGHT: Tolerance = { ratio: 0.15, dx: 0.3, dy: 0.4 }
export const LOOSE: Tolerance = { ratio: 0.25, dx: 0.45, dy: 0.6 }

export function placementWithin(p: Placement, tol: Tolerance): boolean {
  return Math.abs(p.ratio - 1) < tol.ratio && Math.abs(p.dx) < tol.dx && Math.abs(p.dy) < tol.dy
}

export interface MatchResult {
  /** 0..100, how well the limb angles match (only meaningful when placement is known). */
  score: number
  placement: Placement | null
  /** Per SCORED_BONES index; null when the bone isn't part of this template. */
  boneScores: (number | null)[]
  /** Most important single instruction, or null when everything looks good. */
  hint: string | null
}

function get(points: BodyPoints, ref: JointRef): Vec | undefined {
  if (ref === 'mid_hip') return points.left_hip && points.right_hip && mid(points.left_hip, points.right_hip)
  if (ref === 'mid_shoulder')
    return points.left_shoulder && points.right_shoulder && mid(points.left_shoulder, points.right_shoulder)
  return points[ref]
}

function boneWeight(bone: ScoredBone, keyJoints: Set<string>): number {
  return BASE_WEIGHT[bone.part] * (keyJoints.has(bone.to) ? KEY_JOINT_WEIGHT : 1)
}

const PART_NAME: Record<Part, string> = {
  torso: 'body',
  head: 'head',
  elbow: 'elbow',
  hand: 'hand',
  knee: 'knee',
  foot: 'foot',
}

/**
 * Instruction that moves the bone's end toward the ghost's direction.
 * Raw image +x is the person's own left when they face the camera.
 */
function boneHint(bone: ScoredBone, user: BodyPoints, ghost: BodyPoints): string | null {
  const us = get(user, bone.from)
  const ue = get(user, bone.to)
  const gs = get(ghost, bone.from)
  const ge = get(ghost, bone.to)
  if (!us || !ue || !gs || !ge) return null

  const len = dist(us, ue)
  const ghostDir = scale(sub(ge, gs), 1 / Math.max(dist(gs, ge), 1e-6))
  const d = sub(add(us, scale(ghostDir, len)), ue)

  if (bone.part === 'torso') return `Lean to your ${d[0] > 0 ? 'left' : 'right'}`
  if (bone.part === 'head') return `Tilt your head to your ${d[0] > 0 ? 'left' : 'right'}`

  const thing = `your ${bone.side} ${PART_NAME[bone.part]}`
  if (Math.abs(d[1]) >= Math.abs(d[0])) return d[1] < 0 ? `Raise ${thing}` : `Lower ${thing}`
  const outward = bone.side === 'left' ? 1 : -1
  return d[0] * outward > 0 ? `Move ${thing} out` : `Bring ${thing} in`
}

function placementHint(p: Placement, shot: PoseTemplate['shot']): string | null {
  const selfie = shot === 'selfie'
  if (p.ratio < 1 - TIGHT.ratio) return selfie ? 'Bring the phone closer' : 'Step closer'
  if (p.ratio > 1 + TIGHT.ratio) return selfie ? 'Hold the phone further away' : 'Step back'
  // Person at +x (their left): they should move to their right, or the phone to their left.
  if (Math.abs(p.dx) >= TIGHT.dx) {
    const towardTheirRight = p.dx > 0
    if (selfie) return `Move the phone to your ${towardTheirRight ? 'left' : 'right'}`
    return `Move to your ${towardTheirRight ? 'right' : 'left'}`
  }
  if (Math.abs(p.dy) >= TIGHT.dy) {
    if (selfie) return p.dy > 0 ? 'Lower the phone a little' : 'Raise the phone a little'
    return p.dy > 0 ? 'Point the camera a bit lower' : 'Point the camera a bit higher'
  }
  return null
}

export function matchPose(user: BodyPoints | null, ghost: Ghost, template: PoseTemplate): MatchResult {
  const boneScores: (number | null)[] = SCORED_BONES.map(() => null)
  if (!user || Object.keys(user).length === 0) {
    return { score: 0, placement: null, boneScores, hint: 'Step into the frame' }
  }

  const anchor = anchorFor(user, template.frame)
  if (!anchor) {
    const hint = template.frame === 'torso' ? 'Step back so I can see you from head to hips' : 'Show your face and shoulders'
    return { score: 0, placement: null, boneScores, hint }
  }
  const g = ghost.anchor
  const placement: Placement = {
    ratio: anchor.unit / g.unit,
    dx: (anchor.origin[0] - g.origin[0]) / g.unit,
    dy: (anchor.origin[1] - g.origin[1]) / g.unit,
  }

  const keyJoints = new Set<string>(template.key_joints)
  let weighted = 0
  let totalWeight = 0
  let worstKey = 1
  let worst: { bone: ScoredBone; deficit: number; missing: boolean } | null = null

  for (const [i, bone] of SCORED_BONES.entries()) {
    const gs = get(ghost.points, bone.from)
    const ge = get(ghost.points, bone.to)
    if (!gs || !ge) continue
    const w = boneWeight(bone, keyJoints)
    const us = get(user, bone.from)
    const ue = get(user, bone.to)

    let s: number
    const missing = !us || !ue
    if (missing) {
      // Occluded limbs get partial credit, unless the pose is about that limb.
      s = keyJoints.has(bone.to) ? 0 : 0.5
    } else {
      const diff = angleDiff(angleOf(us, ue), angleOf(gs, ge))
      s = Math.exp(-((diff / ANGLE_TOLERANCE) ** 2))
    }
    boneScores[i] = s
    if (keyJoints.has(bone.to)) worstKey = Math.min(worstKey, s)
    weighted += w * s
    totalWeight += w

    const deficit = w * (1 - s)
    if (s < HINT_BELOW && (!worst || deficit > worst.deficit)) worst = { bone, deficit, missing }
  }

  // An average hides one badly wrong limb; the limbs that define the pose must all be close.
  const score = totalWeight > 0 ? (weighted / totalWeight) * Math.sqrt(worstKey) * 100 : 0

  let hint = template.shot === 'full_body' && !user.left_ankle && !user.right_ankle ? 'Step back so I can see your feet' : null
  hint ??= placementHint(placement, template.shot)
  if (!hint && worst) {
    const { bone, missing } = worst
    hint = missing
      ? `I can't see your ${bone.side ? `${bone.side} ` : ''}${PART_NAME[bone.part]}`
      : boneHint(bone, user, ghost.points)
  }
  return { score, placement, boneScores, hint }
}
