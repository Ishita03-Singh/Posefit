import { describe, expect, it } from 'vitest'

import { type Keypoint, LANDMARK_NAMES, type LandmarkName } from './landmarks'
import { inferShot, normalize, pickKeyJoints, templateFromPhoto } from './fromPhoto'
import type { Vec } from './geometry'
import { SCAN_TEMPLATE, TEMPLATES } from './template'

const byId = (id: string) => TEMPLATES.find((t) => t.id === id)!

describe('normalize (parity with tools/posefit_tools/template.py)', () => {
  it('reproduces every Python-generated template from "photo" pixels', () => {
    for (const t of TEMPLATES) {
      // Place the template in an arbitrary photo: scale 173px per unit, offset (412, 655).
      const px = Object.fromEntries(
        Object.entries(t.keypoints).map(([n, p]) => [n, [412 + p![0] * 173, 655 + p![1] * 173] as Vec]),
      )
      const { frame, keypoints } = normalize(px)
      expect(frame, t.id).toBe(t.frame)
      for (const [name, p] of Object.entries(t.keypoints)) {
        expect(keypoints[name as LandmarkName]![0], `${t.id} ${name}`).toBeCloseTo(p![0], 3)
        expect(keypoints[name as LandmarkName]![1], `${t.id} ${name}`).toBeCloseTo(p![1], 3)
      }
      expect(inferShot(px), t.id).toBe(t.shot)
    }
  })

  it('matches the Python unit test values', () => {
    const { frame, keypoints } = normalize({
      left_shoulder: [140, 100],
      right_shoulder: [60, 100],
      left_hip: [120, 300],
      right_hip: [80, 300],
    })
    expect(frame).toBe('torso')
    expect(keypoints.left_shoulder).toEqual([0.2, -1])
  })

  it('explains what is missing', () => {
    expect(() => normalize({ nose: [0, 0] })).toThrow(/shoulders/)
  })
})

describe('templateFromPhoto', () => {
  /** MediaPipe-style landmarks (0..1) for a template drawn into a 1000x1500 photo. */
  function landmarksFor(id: string, hide: LandmarkName[] = []): Keypoint[] {
    const t = byId(id)
    return LANDMARK_NAMES.map((name) => {
      const p = t.keypoints[name]
      if (!p || hide.includes(name)) return { x: 0, y: 0, z: 0, visibility: 0.1 }
      return { x: (500 + p[0] * 300) / 1000, y: (900 + p[1] * 300) / 1500, z: 0, visibility: 0.95 }
    })
  }

  it('builds a valid template and finds the joints that make the pose', () => {
    const t = templateFromPhoto({
      landmarks: landmarksFor('classic-hand-on-hip'),
      width: 1000,
      height: 1500,
      name: 'Café lean!',
      ref: 'pin.jpg',
      neutral: SCAN_TEMPLATE,
      suffix: 'abcde',
    })
    expect(t.id).toBe('my-caf-lean-abcde')
    expect(t.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
    expect(t.shot).toBe('full_body')
    expect(t.frame).toBe('torso')
    expect(t.key_joints).toContain('left_wrist')
    expect(t.source).toEqual({ kind: 'photo', ref: 'pin.jpg' })
    expect(t.keypoints.left_wrist![0]).toBeCloseTo(byId('classic-hand-on-hip').keypoints.left_wrist![0], 3)
  })

  it('drops low-visibility points and infers a half-body shot', () => {
    const legs: LandmarkName[] = ['left_knee', 'right_knee', 'left_ankle', 'right_ankle', 'left_heel', 'right_heel', 'left_foot_index', 'right_foot_index']
    const t = templateFromPhoto({
      landmarks: landmarksFor('classic-hand-on-hip', legs),
      width: 1000,
      height: 1500,
      name: 'Top half',
      ref: 'x.png',
      neutral: SCAN_TEMPLATE,
    })
    expect(t.shot).toBe('half_body')
    expect(t.keypoints.left_knee).toBeUndefined()
  })

  it('neutral standing pose has no key joints', () => {
    expect(pickKeyJoints(SCAN_TEMPLATE.keypoints, SCAN_TEMPLATE.keypoints)).toEqual([])
  })
})
