import { describe, expect, it } from 'vitest'

import type { BodyPoints } from '../pose/body'
import { add, dist, type Vec } from '../pose/geometry'
import type { LandmarkName } from '../pose/landmarks'
import { BodyProfile } from '../pose/profile'
import { TEMPLATES } from '../pose/template'
import { flipTemplate, placeGhost, retarget } from './fit'
import { matchPose, SCORED_BONES } from './match'

const W = 720
const H = 1280
const template = TEMPLATES.find((t) => t.id === 'classic-hand-on-hip')!

function setup() {
  const ghost = placeGhost(template, template.keypoints, W, H)
  // A "person" standing exactly in the ghost.
  const user: BodyPoints = structuredClone(ghost.points)
  return { ghost, user }
}

function transform(points: BodyPoints, f: (p: Vec) => Vec): BodyPoints {
  const out: BodyPoints = {}
  for (const [k, p] of Object.entries(points) as [LandmarkName, Vec][]) out[k] = f(p)
  return out
}

/** Rotates `joint` around `pivot` by `degrees`. */
function rotateJoint(points: BodyPoints, pivot: LandmarkName, joint: LandmarkName, degrees: number) {
  const c = points[pivot]!
  const p = points[joint]!
  const a = (degrees * Math.PI) / 180
  const v: Vec = [p[0] - c[0], p[1] - c[1]]
  points[joint] = [c[0] + v[0] * Math.cos(a) - v[1] * Math.sin(a), c[1] + v[0] * Math.sin(a) + v[1] * Math.cos(a)]
}

describe('matchPose', () => {
  it('scores a perfect match at 100, ready, with no hint', () => {
    const { ghost, user } = setup()
    const r = matchPose(user, ghost, template)
    expect(r.score).toBeCloseTo(100)
    expect(r.placement!.ratio).toBeCloseTo(1)
    expect(r.hint).toBeNull()
    expect(r.ready).toBe(true)
  })

  it('returns the person\'s own anchor so the ghost can be drawn on them', () => {
    const { ghost, user } = setup()
    const r = matchPose(user, ghost, template)
    expect(r.anchor!.unit).toBeCloseTo(ghost.anchor.unit)
    expect(r.anchor!.origin[0]).toBeCloseTo(ghost.anchor.origin[0])
  })

  it('tolerates moderate distance differences (the ghost follows the person)', () => {
    const { ghost, user } = setup()
    const o = ghost.anchor.origin
    const nearer = transform(user, (p) => [o[0] + (p[0] - o[0]) * 0.8, o[1] + (p[1] - o[1]) * 0.8])
    expect(matchPose(nearer, ghost, template).ready).toBe(true)
  })

  it('asks to step closer when the person is very small in frame', () => {
    const { ghost, user } = setup()
    const o = ghost.anchor.origin
    const far = transform(user, (p) => [o[0] + (p[0] - o[0]) * 0.5, o[1] + (p[1] - o[1]) * 0.5])
    const r = matchPose(far, ghost, template)
    expect(r.hint).toBe('Step closer')
    expect(r.ready).toBe(false)
  })

  it('asks to step back when the pose would be cut off at the bottom', () => {
    const { ghost, user } = setup()
    const o = ghost.anchor.origin
    // Slightly bigger (within size tolerance) and lower, so the feet leave the frame.
    const close = transform(user, (p) => [o[0] + (p[0] - o[0]) * 1.25, o[1] + (p[1] - o[1]) * 1.25 + 0.06 * H])
    const r = matchPose(close, ghost, template)
    expect(r.hint).toBe('Step back')
    expect(r.ready).toBe(false)
  })

  it("gives left/right directions from the person's point of view", () => {
    const { ghost, user } = setup()
    // +x in the raw frame is the person's own left, so they need to move to their right.
    const shifted = transform(user, (p) => [p[0] + ghost.anchor.unit * 0.9, p[1]])
    expect(matchPose(shifted, ghost, template).hint).toBe('Move to your right')
  })

  it('pose score is independent of where the person stands', () => {
    const { ghost, user } = setup()
    const shifted = transform(user, (p) => [p[0] + 40, p[1] - 25])
    expect(matchPose(shifted, ghost, template).score).toBeCloseTo(100)
  })

  it('names the limb to fix and is not ready', () => {
    const { ghost, user } = setup()
    // Left arm hanging straight down instead of hand on hip.
    const elbow = user.left_elbow!
    const forearm = dist(elbow, user.left_wrist!)
    user.left_wrist = add(elbow, [0, forearm])
    const r = matchPose(user, ghost, template)
    expect(r.score).toBeLessThan(50)
    expect(r.hint).toBe('Bring your left hand in')
    expect(r.ready).toBe(false)
  })

  it('reports a missing key limb', () => {
    const { ghost, user } = setup()
    delete user.left_wrist
    const r = matchPose(user, ghost, template)
    expect(r.hint).toBe("I can't see your left hand")
    expect(r.ready).toBe(false)
  })
})

describe('ready means "what you see is green"', () => {
  it('is ready when key limbs are green even if a non-key limb is amber', () => {
    const { ghost, user } = setup()
    rotateJoint(user, 'right_elbow', 'right_wrist', 25) // right arm is not a key joint here
    const r = matchPose(user, ghost, template)
    const i = SCORED_BONES.findIndex((b) => b.to === 'right_wrist')
    expect(r.boneScores[i]).toBeLessThan(0.8)
    expect(r.boneScores[i]).toBeGreaterThanOrEqual(0.5)
    expect(r.ready).toBe(true)
  })

  it('is not ready when any limb is red', () => {
    const { ghost, user } = setup()
    rotateJoint(user, 'right_elbow', 'right_wrist', 60)
    expect(matchPose(user, ghost, template).ready).toBe(false)
  })

  it('a small error on a key limb keeps the score >= 80', () => {
    const { ghost, user } = setup()
    rotateJoint(user, 'left_elbow', 'left_wrist', 12)
    const r = matchPose(user, ghost, template)
    expect(r.score).toBeGreaterThanOrEqual(80)
    expect(r.ready).toBe(true)
  })
})

describe('fit', () => {
  it('flipping twice returns the original template', () => {
    const twice = flipTemplate(flipTemplate(template))
    expect(twice.keypoints).toEqual(template.keypoints)
    expect(flipTemplate(template).key_joints).toContain('right_wrist')
  })

  it('retargeting keeps joint directions and torso, scales limbs', () => {
    const profile = new BodyProfile()
    // A person with 20% longer forearms than average.
    profile.update({
      left_shoulder: [100, 100],
      right_shoulder: [20, 100],
      left_hip: [80, 200],
      right_hip: [40, 200],
      left_elbow: [100, 162],
      left_wrist: [100, 162 + 0.55 * 1.2 * 100],
    })
    expect(profile.factor('forearm')).toBeCloseTo(1.2, 1)

    const kp = retarget(template, profile)
    // Hips may widen or narrow, but stay centred on the template origin.
    const midHip = (k: typeof kp) => [(k.left_hip![0] + k.right_hip![0]) / 2, (k.left_hip![1] + k.right_hip![1]) / 2]
    expect(midHip(kp)[0]).toBeCloseTo(midHip(template.keypoints)[0])
    expect(midHip(kp)[1]).toBeCloseTo(midHip(template.keypoints)[1])
    const before = dist(template.keypoints.left_elbow!, template.keypoints.left_wrist!)
    const after = dist(kp.left_elbow!, kp.left_wrist!)
    expect(after / before).toBeCloseTo(profile.factor('forearm'))
  })

  it('places full-body ghosts inside the frame', () => {
    const { ghost } = setup()
    for (const [x, y] of Object.values(ghost.points) as Vec[]) {
      expect(x).toBeGreaterThan(0)
      expect(x).toBeLessThan(W)
      expect(y).toBeGreaterThan(0)
      expect(y).toBeLessThan(H)
    }
  })
})
