// Photo -> pose template, in the browser. Mirrors tools/posefit_tools/template.py and extract.py
// so templates made in the app and by the Python tool are interchangeable.

import { angleDiff, angleOf, dist, mid, type Vec } from './geometry'
import { HEAD_TO_TORSO } from './body'
import { type Keypoint, LM, type LandmarkName } from './landmarks'
import type { PoseTemplate, Shot } from './template'

export const TEMPLATE_KEYPOINTS: LandmarkName[] = [
  'nose',
  'left_eye',
  'right_eye',
  'left_ear',
  'right_ear',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'left_heel',
  'right_heel',
  'left_foot_index',
  'right_foot_index',
]

const MIN_VISIBILITY = 0.5

type Points = Partial<Record<LandmarkName, Vec>>

/** Confident, in-frame template keypoints in pixels (pixels keep distances isotropic). */
export function keypointsFromLandmarks(landmarks: Keypoint[], width: number, height: number): Points {
  const out: Points = {}
  for (const name of TEMPLATE_KEYPOINTS) {
    const lm = landmarks[LM[name]]
    if (!lm || lm.visibility < MIN_VISIBILITY) continue
    if (lm.x < -0.02 || lm.x > 1.02 || lm.y < -0.02 || lm.y > 1.02) continue
    out[name] = [lm.x * width, lm.y * height]
  }
  return out
}

const round4 = (v: number) => Math.round(v * 1e4) / 1e4

/** Moves and scales keypoints into the template frame (see template.py for the definition). */
export function normalize(points: Points): { frame: PoseTemplate['frame']; keypoints: PoseTemplate['keypoints'] } {
  const { left_shoulder: ls, right_shoulder: rs, left_hip: lh, right_hip: rh, nose } = points
  if (!ls || !rs) throw new Error('Both shoulders need to be visible')
  const midShoulder = mid(ls, rs)

  let frame: PoseTemplate['frame']
  let origin: Vec
  let unit: number
  if (lh && rh) {
    frame = 'torso'
    origin = mid(lh, rh)
    unit = dist(midShoulder, origin)
  } else if (nose) {
    frame = 'head'
    origin = midShoulder
    unit = dist(nose, midShoulder) / HEAD_TO_TORSO
  } else {
    throw new Error('Need the hips or the face to be visible')
  }
  if (unit < 1e-6) throw new Error('Pose is too small to measure')

  const keypoints: PoseTemplate['keypoints'] = {}
  for (const name of TEMPLATE_KEYPOINTS) {
    const p = points[name]
    if (p) keypoints[name] = [round4((p[0] - origin[0]) / unit), round4((p[1] - origin[1]) / unit)]
  }
  return { frame, keypoints }
}

export function inferShot(points: Points): Shot {
  const has = (n: LandmarkName) => points[n] !== undefined
  if ((has('left_knee') || has('right_knee')) && (has('left_ankle') || has('right_ankle'))) return 'full_body'
  if (has('left_hip') || has('right_hip')) return 'half_body'
  return 'selfie'
}

const LIMBS: [LandmarkName, LandmarkName][] = (['left', 'right'] as const).flatMap((s) => [
  [`${s}_shoulder`, `${s}_elbow`],
  [`${s}_elbow`, `${s}_wrist`],
  [`${s}_hip`, `${s}_knee`],
  [`${s}_knee`, `${s}_ankle`],
]) as [LandmarkName, LandmarkName][]

/**
 * The joints that make this pose distinctive: limb ends whose direction differs most from a
 * neutral standing pose. Matching weights these higher, so "hand on hip" is about the hand.
 */
export function pickKeyJoints(keypoints: PoseTemplate['keypoints'], neutral: PoseTemplate['keypoints']): LandmarkName[] {
  const diffs: { joint: LandmarkName; diff: number }[] = []
  for (const [a, b] of LIMBS) {
    const pa = keypoints[a]
    const pb = keypoints[b]
    const na = neutral[a]
    const nb = neutral[b]
    if (!pa || !pb || !na || !nb) continue
    const diff = angleDiff(angleOf(pa, pb), angleOf(na, nb))
    if (diff > 25) diffs.push({ joint: b, diff })
  }
  return diffs
    .sort((x, y) => y.diff - x.diff)
    .slice(0, 4)
    .map((d) => d.joint)
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'pose'

export function templateFromPhoto(opts: {
  landmarks: Keypoint[]
  width: number
  height: number
  name: string
  ref: string
  neutral: PoseTemplate
  /** Makes ids unique; injectable for tests. */
  suffix?: string
}): PoseTemplate {
  const points = keypointsFromLandmarks(opts.landmarks, opts.width, opts.height)
  const { frame, keypoints } = normalize(points)
  const suffix = opts.suffix ?? Math.random().toString(36).slice(2, 7)
  return {
    schema_version: 1,
    id: `my-${slug(opts.name)}-${suffix}`,
    name: opts.name.trim() || 'My pose',
    description: 'Added from your photo.',
    shot: inferShot(points),
    tags: ['mine'],
    frame,
    keypoints,
    key_joints: pickKeyJoints(keypoints, opts.neutral.keypoints),
    source: { kind: 'photo', ref: opts.ref },
  }
}
