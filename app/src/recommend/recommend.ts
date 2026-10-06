import { angleOf, dist, mid, type Vec } from '../pose/geometry'
import { STANDARD } from '../pose/profile'
import type { BodyShape } from '../pose/shape'
import type { PoseTemplate, Shot } from '../pose/template'

/**
 * "Poses for you": rule-based suggestions from the person's measured proportions.
 *
 * Deliberately honest about what is measured: proportions from the body scan (relative widths
 * and limb lengths), never height or weight, and observations are phrased neutrally rather
 * than as body-type labels. This is the baseline later ML/LLM recommenders must beat.
 */

// --- what a pose does (computed from geometry, so it works for photo poses too) ---------

export interface PoseFeatures {
  /** Hand(s) resting at the waist/hips with the elbow out (incl. hands in pockets). */
  handOnHip: boolean
  /** Space between an arm and the body. */
  armsAway: boolean
  /** A hand above shoulder height. */
  armsRaised: boolean
  /** Body turned away from the camera (narrower shoulders). */
  turned: boolean
  /** Weight on one leg: hips tilted. */
  weightShift: boolean
  /** Legs crossed at the knees or ankles. */
  legsCrossed: boolean
  sitting: boolean
}

export type Feature = keyof PoseFeatures

export function poseFeatures(t: PoseTemplate): PoseFeatures {
  const k = t.keypoints
  const sides = ['left', 'right'] as const
  // Person's left is +x: "outward" is +x on the left side, -x on the right.
  const out = (side: 'left' | 'right', from: Vec | undefined, to: Vec | undefined) =>
    from && to ? (to[0] - from[0]) * (side === 'left' ? 1 : -1) : 0

  const handOnHip = sides.some((s) => {
    const w = k[`${s}_wrist`]
    const hip = k[`${s}_hip`]
    // At the side of the body (not clasped in front), elbow out.
    return (
      !!w &&
      !!hip &&
      dist(w, hip) < 0.35 &&
      out(s, hip, w) > -0.02 &&
      out(s, k[`${s}_shoulder`], k[`${s}_elbow`]) > 0.12
    )
  })
  const armsAway = sides.some(
    (s) => out(s, k[`${s}_shoulder`], k[`${s}_elbow`]) > 0.12 || out(s, k[`${s}_hip`], k[`${s}_wrist`]) > 0.2,
  )
  const shoulderY = k.left_shoulder && k.right_shoulder ? mid(k.left_shoulder, k.right_shoulder)[1] : 0
  const armsRaised = sides.some((s) => (k[`${s}_wrist`]?.[1] ?? Infinity) < shoulderY - 0.05)

  const turned =
    !!k.left_shoulder && !!k.right_shoulder && dist(k.left_shoulder, k.right_shoulder) < 0.85 * STANDARD.shoulderWidth

  const hipTilt = k.left_hip && k.right_hip ? Math.abs(angleOf(k.right_hip, k.left_hip)) : 0
  const weightShift = hipTilt > 3 && hipTilt < 177

  const legsCrossed =
    !!k.left_ankle && !!k.right_ankle && !!k.left_hip && !!k.right_hip && k.left_ankle[0] < k.right_ankle[0]

  const sitting = sides.some((s) => {
    const hip = k[`${s}_hip`]
    const knee = k[`${s}_knee`]
    // Thigh foreshortened toward the camera, or roughly horizontal.
    return !!hip && !!knee && (dist(hip, knee) < 0.6 * STANDARD.thigh || knee[1] - hip[1] < 0.45)
  })

  return { handOnHip, armsAway, armsRaised, turned, weightShift, legsCrossed, sitting }
}

// --- what the body scan says (neutral observations) ------------------------------------

export type TraitId = 'broad-shoulders' | 'balanced' | 'hips' | 'straight-waist' | 'defined-waist' | 'shorter-legs' | 'longer-legs'

export interface Trait {
  id: TraitId
  text: string
}

export function bodyTraits(shape: BodyShape): Trait[] {
  const { shoulders, waist, hips } = shape.torso
  const traits: Trait[] = []

  const shoulderHip = shoulders / hips
  if (shoulderHip > 1.45) traits.push({ id: 'broad-shoulders', text: 'Your shoulders are noticeably wider than your hips' })
  else if (shoulderHip < 1.15) traits.push({ id: 'hips', text: 'Your hips are about as wide as your shoulders' })
  else traits.push({ id: 'balanced', text: 'Your shoulders and hips are in balance' })

  const waistRatio = waist / Math.min(shoulders, hips)
  if (waistRatio > 0.9) traits.push({ id: 'straight-waist', text: 'Your waist is close in width to your hips' })
  else if (waistRatio < 0.78) traits.push({ id: 'defined-waist', text: 'You have a defined waist' })

  const { thigh, shin } = shape.lengths
  if (thigh !== undefined && shin !== undefined) {
    const legs = (thigh + shin) / (STANDARD.thigh + STANDARD.shin)
    if (legs < 0.94) traits.push({ id: 'shorter-legs', text: 'Your legs are a little shorter than average for your torso' })
    else if (legs > 1.06) traits.push({ id: 'longer-legs', text: 'Your legs are longer than average for your torso' })
  }
  return traits
}

// --- photography rules ---------------------------------------------------------------

interface Rule {
  /** null = applies to everyone. */
  trait: TraitId | null
  feature: Feature
  weight: number
  reason: string
}

const RULES: Rule[] = [
  // Generally flattering for anyone.
  { trait: null, feature: 'weightShift', weight: 0.5, reason: 'Weight on one leg adds a natural S-curve' },
  { trait: null, feature: 'armsAway', weight: 0.5, reason: 'Space between your arms and body looks more relaxed' },

  { trait: 'shorter-legs', feature: 'legsCrossed', weight: 2.5, reason: 'Crossed legs make legs look longer' },
  { trait: 'shorter-legs', feature: 'weightShift', weight: 1, reason: 'Weight on one leg lengthens the body line' },
  { trait: 'shorter-legs', feature: 'sitting', weight: -1.5, reason: 'Seated poses can shorten the legs' },
  { trait: 'longer-legs', feature: 'sitting', weight: 1, reason: 'Seated poses show off long legs' },
  { trait: 'longer-legs', feature: 'legsCrossed', weight: 0.5, reason: 'Crossed legs highlight your leg line' },

  { trait: 'broad-shoulders', feature: 'turned', weight: 2, reason: 'Turning your body narrows the shoulders' },
  { trait: 'broad-shoulders', feature: 'handOnHip', weight: 1, reason: 'Hands at the hips add shape at the waist' },
  { trait: 'broad-shoulders', feature: 'armsRaised', weight: -1, reason: 'Raised arms widen the shoulder line' },

  { trait: 'hips', feature: 'armsRaised', weight: 1.5, reason: 'Raised arms draw the eye up and balance the hips' },
  { trait: 'hips', feature: 'turned', weight: 1.5, reason: 'A three-quarter turn slims the hips' },

  { trait: 'straight-waist', feature: 'handOnHip', weight: 2, reason: 'Hands at the hips create a waistline' },
  { trait: 'straight-waist', feature: 'armsAway', weight: 1, reason: 'Space between arm and body defines the waist' },

  { trait: 'defined-waist', feature: 'weightShift', weight: 1.5, reason: 'Shifting your weight shows your waist curve' },
  { trait: 'defined-waist', feature: 'handOnHip', weight: 1, reason: 'Hands at the hips frame your waist' },
]

export interface Recommendation {
  template: PoseTemplate
  score: number
  /** Why this pose suits the person, best first (positive reasons only). */
  reasons: string[]
}

export interface RecommendContext {
  /** Shot the camera setup favours: selfie camera -> selfies, rear camera -> full body. */
  preferShot?: Shot
}

export function recommend(templates: PoseTemplate[], shape: BodyShape | null, ctx: RecommendContext = {}): Recommendation[] {
  const traits = new Set(shape ? bodyTraits(shape).map((t) => t.id) : [])
  return templates
    .map((template) => {
      const f = poseFeatures(template)
      let score = 0
      // One reason per pose feature: the strongest rule that applies.
      const reasons = new Map<Feature, { text: string; weight: number }>()
      for (const rule of RULES) {
        if (rule.trait !== null && !traits.has(rule.trait)) continue
        if (!f[rule.feature]) continue
        score += rule.weight
        const best = reasons.get(rule.feature)
        if (rule.weight > 0 && (!best || rule.weight > best.weight)) reasons.set(rule.feature, { text: rule.reason, weight: rule.weight })
      }
      if (ctx.preferShot) {
        if (template.shot === ctx.preferShot) score += 3
        else if (ctx.preferShot === 'selfie' && template.shot === 'half_body') score += 1
      }
      return {
        template,
        score,
        reasons: [...reasons.values()].sort((a, b) => b.weight - a.weight).map((r) => r.text),
      }
    })
    .sort((a, b) => b.score - a.score || a.template.name.localeCompare(b.template.name))
}
