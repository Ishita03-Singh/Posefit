import { describe, expect, it } from 'vitest'

import type { BodyPoints } from '../pose/body'
import { tiltFromGravity } from '../sensors/tilt'
import { HintStabilizer } from './coach'
import { composition, type CompositionInput } from './composition'
import { cameraCue, cueSpeech, cueText, subjectCue, toThirdPerson } from './cues'

describe('cues', () => {
  it('rephrases subject instructions for the photographer', () => {
    expect(toThirdPerson('Raise your left hand')).toBe('Ask them to raise their left hand')
    expect(toThirdPerson('Tilt your head to your right')).toBe('Ask them to tilt their head to their right')
  })

  it('speaks only subject instructions in friend mode', () => {
    const pose = subjectCue('k', 'Raise your left hand')
    const cam = cameraCue('c', 'Step back', 'Move back a few steps')
    expect(cueText(pose, 'friend')).toBe('Ask them to raise their left hand')
    expect(cueSpeech(pose, 'friend')).toBe('Raise your left hand')
    expect(cueSpeech(cam, 'friend')).toBeNull()
    expect(cueSpeech(cam, 'self')).toBe('Step back')
  })

  it('stabilizer compares cues by key', () => {
    const s = new HintStabilizer<{ key: string }>(100)
    expect(s.update({ key: 'a' }, 0)).toBeNull()
    expect(s.update({ key: 'a' }, 150)?.key).toBe('a')
    expect(s.update({ key: 'b' }, 160)?.key).toBe('a') // not settled yet
    expect(s.update({ key: 'b' }, 300)?.key).toBe('b')
  })
})

describe('tiltFromGravity', () => {
  const g = 9.81
  const rad = (d: number) => (d * Math.PI) / 180

  it('reads an upright, level phone as zero', () => {
    const t = tiltFromGravity(0, g, 0, 0)!
    expect(t.roll).toBeCloseTo(0)
    expect(t.pitch).toBeCloseTo(0)
  })

  it('reads roll and pitch', () => {
    // Phone rotated 10° clockwise: world-up appears rotated counter-clockwise on screen.
    expect(tiltFromGravity(-g * Math.sin(rad(10)), g * Math.cos(rad(10)), 0, 0)!.roll).toBeCloseTo(-10)
    // Screen tipped 20° toward the sky: rear camera points down.
    expect(tiltFromGravity(0, g * Math.cos(rad(20)), g * Math.sin(rad(20)), 0)!.pitch).toBeCloseTo(20)
  })

  it('handles browsers that report gravity instead of the upward reaction', () => {
    const t = tiltFromGravity(0, -g * Math.cos(rad(20)), -g * Math.sin(rad(20)), 0)!
    expect(t.pitch).toBeCloseTo(20)
    expect(t.roll).toBeCloseTo(0)
  })

  it('accounts for landscape screen rotation', () => {
    // Device rotated 90° (landscape): device +x now points up on screen.
    expect(tiltFromGravity(g, 0, 0, 90)!.roll).toBeCloseTo(0)
  })

  it('ignores readings while the phone is being shaken', () => {
    expect(tiltFromGravity(0.5, 0.5, 0.5, 0)).toBeNull()
  })
})

describe('composition', () => {
  const W = 720
  const H = 1280
  const base: CompositionInput = { user: null, anchor: null, shot: 'full_body', width: W, height: H, tilt: null, facing: 'environment' }

  it('asks to level a tilted phone, urgently when very crooked', () => {
    expect(composition({ ...base, tilt: { roll: 4, pitch: 0 } }).cue?.key).toBe('angle:level')
    expect(composition({ ...base, tilt: { roll: 4, pitch: 0 } }).urgent).toBe(false)
    expect(composition({ ...base, tilt: { roll: 9, pitch: 0 } }).urgent).toBe(true)
  })

  it('warns when the rear camera points down at a full-body shot', () => {
    expect(composition({ ...base, tilt: { roll: 0, pitch: 20 } }).cue?.key).toBe('angle:down')
    // Same phone angle on the selfie camera means the camera points up: not a "down" problem.
    expect(composition({ ...base, facing: 'user', tilt: { roll: 0, pitch: 20 } }).cue?.key).toBe('angle:up')
  })

  it('flags the low-angle selfie', () => {
    const c = composition({ ...base, shot: 'selfie', facing: 'user', tilt: { roll: 0, pitch: 25 } })
    expect(c.cue?.key).toBe('angle:selfie-low')
  })

  it('flags too much headroom and knee crops', () => {
    const anchor = { origin: [360, 900] as [number, number], unit: 200 }
    const user: BodyPoints = { nose: [360, 700], left_hip: [400, 900], right_hip: [320, 900] }
    expect(composition({ ...base, shot: 'half_body', user, anchor }).cue?.key).toBe('frame:headroom')

    const cropped: BodyPoints = { nose: [360, 300], left_knee: [400, H - 10], left_hip: [400, 1100], right_hip: [320, 1100] }
    expect(composition({ ...base, shot: 'half_body', user: cropped, anchor }).cue?.key).toBe('frame:knees')
  })

  it('suggests keeping feet near the bottom for full-body shots', () => {
    const anchor = { origin: [360, 600] as [number, number], unit: 200 }
    const user: BodyPoints = { nose: [360, 300], left_ankle: [380, 950], right_ankle: [340, 950] }
    expect(composition({ ...base, user, anchor }).cue?.key).toBe('frame:feet')
  })
})
