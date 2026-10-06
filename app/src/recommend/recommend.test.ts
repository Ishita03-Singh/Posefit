import { describe, expect, it } from 'vitest'

import { DEFAULT_SHAPE, type BodyShape } from '../pose/shape'
import { SCAN_TEMPLATE, TEMPLATES } from '../pose/template'
import { bodyTraits, poseFeatures, recommend } from './recommend'

const byId = (id: string) => TEMPLATES.find((t) => t.id === id)!

describe('poseFeatures (from geometry)', () => {
  it('recognises what each starter pose does', () => {
    expect(poseFeatures(byId('classic-hand-on-hip')).handOnHip).toBe(true)
    expect(poseFeatures(byId('classic-hand-on-hip')).weightShift).toBe(true)
    expect(poseFeatures(byId('crossed-ankles')).legsCrossed).toBe(true)
    expect(poseFeatures(byId('hands-in-pockets')).turned).toBe(true)
    expect(poseFeatures(byId('victory-arms-up')).armsRaised).toBe(true)
    expect(poseFeatures(byId('hand-in-hair')).armsRaised).toBe(true)
    expect(poseFeatures(byId('seated-steps')).sitting).toBe(true)
  })

  it('finds nothing special in the neutral scan pose', () => {
    const f = poseFeatures(SCAN_TEMPLATE)
    expect(f.handOnHip || f.turned || f.sitting || f.legsCrossed || f.armsRaised).toBe(false)
  })
})

const shape = (patch: Partial<BodyShape['torso']>, lengths: BodyShape['lengths'] = {}): BodyShape => ({
  ...DEFAULT_SHAPE,
  torso: { ...DEFAULT_SHAPE.torso, ...patch },
  lengths,
})

describe('bodyTraits', () => {
  it('describes proportions neutrally', () => {
    expect(bodyTraits(DEFAULT_SHAPE).map((t) => t.id)).toEqual(['balanced'])
    expect(bodyTraits(shape({ shoulders: 0.56, hips: 0.36 })).map((t) => t.id)).toContain('broad-shoulders')
    expect(bodyTraits(shape({ shoulders: 0.42, hips: 0.4, waist: 0.38 })).map((t) => t.id)).toEqual(['hips', 'straight-waist'])
    expect(bodyTraits(shape({}, { thigh: 0.78, shin: 0.76 })).map((t) => t.id)).toContain('shorter-legs')
  })

  it('never mentions weight or height', () => {
    const all = [
      shape({ shoulders: 0.56, hips: 0.36 }),
      shape({ shoulders: 0.42, hips: 0.4, waist: 0.38 }),
      shape({ waist: 0.25 }, { thigh: 1.0, shin: 0.95 }),
    ].flatMap(bodyTraits)
    for (const t of all) expect(t.text).not.toMatch(/weight|heavy|thin|fat|tall|short(?! than average)|height/i)
  })
})

describe('recommend', () => {
  it('suggests elongating poses for shorter legs, with a reason', () => {
    const recs = recommend(TEMPLATES, shape({}, { thigh: 0.78, shin: 0.76 }), { preferShot: 'full_body' })
    expect(recs[0].template.id).toBe('crossed-ankles')
    expect(recs[0].reasons[0]).toBe('Crossed legs make legs look longer')
    // Sitting is ranked last among full-body poses for this person.
    const fullBody = recs.filter((r) => r.template.shot === 'full_body')
    expect(fullBody.at(-1)!.template.id).toBe('seated-steps')
  })

  it('suggests a waistline for a straighter figure', () => {
    const recs = recommend(TEMPLATES, shape({ shoulders: 0.42, hips: 0.4, waist: 0.38 }), { preferShot: 'full_body' })
    expect(recs.slice(0, 3).map((r) => r.template.id)).toContain('classic-hand-on-hip')
  })

  it('puts selfies first on the selfie camera, even without a body scan', () => {
    const recs = recommend(TEMPLATES, null, { preferShot: 'selfie' })
    expect(recs[0].template.shot).toBe('selfie')
    expect(recs[1].template.shot).toBe('selfie')
  })
})
