import { type Anchor, anchorFor, type BodyPoints } from '../pose/body'
import { angleDiff, angleOf, add, dist, mid, scale, sub, type Vec } from '../pose/geometry'
import type { LandmarkName } from '../pose/landmarks'
import type { PoseTemplate } from '../pose/template'
import { anchorPoints, type Ghost, HEAD_ROOM } from './fit'

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

/** Bone score bands, shared with the overlay colors so "all green" means "ready to shoot". */
export const GREEN = 0.8
export const AMBER = 0.5

export interface Placement {
  /** Person's size / ideal framed size: <1 too far, >1 too close. */
  ratio: number
  /** Person's offset from the ideal position in torso units (raw image axes). */
  dx: number
  dy: number
}

export interface Tolerance {
  ratio: number
  dx: number
  dy: number
}

// Framing is a soft goal: the ghost follows the person, so only clearly bad framing blocks capture.
export const TIGHT: Tolerance = { ratio: 0.3, dx: 0.6, dy: 0.8 }
export const LOOSE: Tolerance = { ratio: 0.4, dx: 0.8, dy: 1.0 }

export function placementWithin(p: Placement, tol: Tolerance): boolean {
  return Math.abs(p.ratio - 1) < tol.ratio && Math.abs(p.dx) < tol.dx && Math.abs(p.dy) < tol.dy
}

export interface MatchResult {
  /** 0..100, how well the limb angles match (only meaningful when placement is known). */
  score: number
  placement: Placement | null
  /** The person's own anchor (torso position and size), for drawing the ghost on them. */
  anchor: Anchor | null
  /** Per SCORED_BONES index; null when the bone isn't part of this template. */
  boneScores: (number | null)[]
  /** Pose is good enough to start a capture: key limbs green, nothing red, body in frame. */
  ready: boolean
  /** Pose is still good enough to continue a capture already in progress (looser). */
  holding: boolean
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

/** Edge of the frame the pose would be cut off at, if the ghost were drawn on this person. */
function cutOff(ghost: Ghost, anchor: Anchor): 'top' | 'bottom' | 'left' | 'right' | null {
  const pts = Object.values(anchorPoints(ghost.keypoints, anchor)) as Vec[]
  const { width, height } = ghost.frame
  const nose = ghost.keypoints.nose
  const top = Math.min(...pts.map((p) => p[1]), nose ? anchor.origin[1] + (nose[1] - HEAD_ROOM) * anchor.unit : Infinity)
  const margin = 0.01
  if (top < -margin * height) return 'top'
  if (Math.max(...pts.map((p) => p[1])) > (1 + margin) * height) return 'bottom'
  if (Math.min(...pts.map((p) => p[0])) < -margin * width) return 'left'
  if (Math.max(...pts.map((p) => p[0])) > (1 + margin) * width) return 'right'
  return null
}

function framingHint(
  edge: ReturnType<typeof cutOff>,
  p: Placement,
  shot: PoseTemplate['shot'],
): string | null {
  const selfie = shot === 'selfie'
  const tooClose = selfie ? 'Hold the phone further away' : 'Step back'
  const tooFar = selfie ? 'Bring the phone closer' : 'Step closer'
  // Person at +x is toward their own left: they should move to their right (or the phone to their left).
  const sideways = (towardTheirRight: boolean) =>
    selfie
      ? `Move the phone to your ${towardTheirRight ? 'left' : 'right'}`
      : `Move to your ${towardTheirRight ? 'right' : 'left'}`

  if (edge === 'top' || edge === 'bottom') {
    // Cut off at one edge only because they are off-centre vertically? Then aim, else step back.
    if (p.ratio <= 1 + TIGHT.ratio && Math.abs(p.dy) >= TIGHT.dy) {
      return edge === 'bottom'
        ? selfie
          ? 'Lower the phone a little'
          : 'Point the camera a bit lower'
        : selfie
          ? 'Raise the phone a little'
          : 'Point the camera a bit higher'
    }
    return tooClose
  }
  if (edge === 'left' || edge === 'right') return p.ratio > 1 + TIGHT.ratio ? tooClose : sideways(edge === 'right')
  if (p.ratio < 1 - TIGHT.ratio) return tooFar
  if (p.ratio > 1 + TIGHT.ratio) return tooClose
  if (Math.abs(p.dx) >= TIGHT.dx) return sideways(p.dx > 0)
  return null
}

/**
 * Compares a person to a placed template.
 * `ghost` is the ideally framed placement: limb directions are scored against it, and the
 * person's position/size relative to it drives the framing hints.
 */
export function matchPose(user: BodyPoints | null, ghost: Ghost, template: PoseTemplate): MatchResult {
  const boneScores: (number | null)[] = SCORED_BONES.map(() => null)
  const none = { score: 0, placement: null, anchor: null, boneScores, ready: false, holding: false }
  if (!user || Object.keys(user).length === 0) return { ...none, hint: 'Step into the frame' }

  const anchor = anchorFor(user, template.frame)
  if (!anchor) {
    const hint = template.frame === 'torso' ? 'Step back so I can see you from head to hips' : 'Show your face and shoulders'
    return { ...none, hint }
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
  let worstAny = 1
  let worst: { bone: ScoredBone; deficit: number; missing: boolean } | null = null

  for (const [i, bone] of SCORED_BONES.entries()) {
    const gs = get(ghost.points, bone.from)
    const ge = get(ghost.points, bone.to)
    if (!gs || !ge) continue
    const w = boneWeight(bone, keyJoints)
    const isKey = keyJoints.size === 0 || keyJoints.has(bone.to)
    const us = get(user, bone.from)
    const ue = get(user, bone.to)

    let s: number
    const missing = !us || !ue
    if (missing) {
      // Occluded limbs get partial credit, unless the pose is about that limb.
      s = isKey ? 0 : AMBER
    } else {
      const diff = angleDiff(angleOf(us, ue), angleOf(gs, ge))
      s = Math.exp(-((diff / ANGLE_TOLERANCE) ** 2))
    }
    boneScores[i] = s
    weighted += w * s
    totalWeight += w
    if (isKey) worstKey = Math.min(worstKey, s)
    if (!missing) worstAny = Math.min(worstAny, s)

    const deficit = w * (1 - s)
    if (s < HINT_BELOW && (!worst || deficit > worst.deficit)) worst = { bone, deficit, missing }
  }

  // An average hides one badly wrong limb; the limbs that define the pose must all be close.
  const score = totalWeight > 0 ? (weighted / totalWeight) * Math.sqrt(worstKey) * 100 : 0

  const edge = cutOff(ghost, anchor)
  const framing = framingHint(edge, placement, template.shot)

  // Same thresholds as the overlay colors: key limbs green and nothing red means go.
  const ready = edge === null && placementWithin(placement, TIGHT) && worstKey >= GREEN && worstAny >= AMBER
  const holding = placementWithin(placement, LOOSE) && worstKey >= 0.6 && worstAny >= 0.35

  let hint = framing
  if (!hint && worst) {
    const { bone, missing } = worst
    hint = missing
      ? `I can't see your ${bone.side ? `${bone.side} ` : ''}${PART_NAME[bone.part]}`
      : boneHint(bone, user, ghost.points)
  }
  return { score, placement, anchor, boneScores, ready, holding, hint }
}
