import { describe, expect, it } from 'vitest'

import type { BodyPoints } from '../pose/body'
import { add, dist, type Vec } from '../pose/geometry'
import type { LandmarkName } from '../pose/landmarks'
import { BodyProfile } from '../pose/profile'
import { TEMPLATES } from '../pose/template'
import { flipTemplate, placeGhost, retarget } from './fit'
import { matchPose } from './match'

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

describe('matchPose', () => {
  it('scores a perfect match at 100 with no hint', () => {
    const { ghost, user } = setup()
    const r = matchPose(user, ghost, template)
    expect(r.score).toBeCloseTo(100)
    expect(r.placement!.ratio).toBeCloseTo(1)
    expect(r.hint).toBeNull()
  })

  it('asks to step closer when the person is small in frame', () => {
    const { ghost, user } = setup()
    const o = ghost.anchor.origin
    const far = transform(user, (p) => [o[0] + (p[0] - o[0]) * 0.7, o[1] + (p[1] - o[1]) * 0.7])
    expect(matchPose(far, ghost, template).hint).toBe('Step closer')
  })

  it("gives left/right directions from the person's point of view", () => {
    const { ghost, user } = setup()
    // +x in the raw frame is the person's own left, so they need to move to their right.
    const shifted = transform(user, (p) => [p[0] + ghost.anchor.unit * 0.6, p[1]])
    expect(matchPose(shifted, ghost, template).hint).toBe('Move to your right')
  })

  it('pose score is independent of where the person stands', () => {
    const { ghost, user } = setup()
    const shifted = transform(user, (p) => [p[0] + 40, p[1] - 25])
    expect(matchPose(shifted, ghost, template).score).toBeCloseTo(100)
  })

  it('names the limb to fix', () => {
    const { ghost, user } = setup()
    // Left arm hanging straight down instead of hand on hip.
    const elbow = user.left_elbow!
    const forearm = dist(elbow, user.left_wrist!)
    user.left_wrist = add(elbow, [0, forearm])
    const r = matchPose(user, ghost, template)
    expect(r.score).toBeLessThan(50)
    expect(r.hint).toBe('Bring your left hand in')
  })

  it('reports a missing key limb', () => {
    const { ghost, user } = setup()
    delete user.left_wrist
    expect(matchPose(user, ghost, template).hint).toBe("I can't see your left hand")
  })

  it('asks for the whole body on full-body poses', () => {
    const { ghost, user } = setup()
    delete user.left_ankle
    delete user.right_ankle
    expect(matchPose(user, ghost, template).hint).toBe('Step back so I can see your feet')
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
    const ls: Vec = [100, 100]
    const rs: Vec = [20, 100]
    const lh: Vec = [80, 200]
    const rh: Vec = [40, 200]
    const le: Vec = [100, 162]
    profile.update({
      left_shoulder: ls,
      right_shoulder: rs,
      left_hip: lh,
      right_hip: rh,
      left_elbow: le,
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

describe('score sensitivity', () => {
  it('a small error on a key limb still allows capture (>= 80)', () => {
    const { ghost, user } = setup()
    // Rotate the left forearm by 12 degrees around the elbow.
    const e = user.left_elbow!
    const w = user.left_wrist!
    const a = (12 * Math.PI) / 180
    const v: Vec = [w[0] - e[0], w[1] - e[1]]
    user.left_wrist = [e[0] + v[0] * Math.cos(a) - v[1] * Math.sin(a), e[1] + v[0] * Math.sin(a) + v[1] * Math.cos(a)]
    expect(matchPose(user, ghost, template).score).toBeGreaterThanOrEqual(80)
  })
})
