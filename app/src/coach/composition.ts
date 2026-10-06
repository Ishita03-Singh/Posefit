import type { Anchor, BodyPoints } from '../pose/body'
import type { Shot } from '../pose/template'
import type { Tilt } from '../sensors/tilt'
import { type Cue, cameraCue } from './cues'

/**
 * Photography rules that are independent of the chosen pose: a level, upright camera at a
 * flattering height, and framing that doesn't crop awkwardly.
 */
export interface CompositionInput {
  user: BodyPoints | null
  /** Person's torso anchor (pixels per torso length), if their torso is visible. */
  anchor: Anchor | null
  shot: Shot | null
  width: number
  height: number
  tilt: Tilt | null
  facing: 'user' | 'environment'
}

export interface CompositionResult {
  cue: Cue | null
  /** Important enough to show before pose corrections. */
  urgent: boolean
}

const LEVEL_TOLERANCE = 3
const LEVEL_URGENT = 6

export function composition(input: CompositionInput): CompositionResult {
  const { tilt, facing, shot } = input

  if (tilt) {
    const off = Math.abs(tilt.roll)
    if (off > LEVEL_TOLERANCE) {
      return { cue: cameraCue('angle:level', 'Hold the phone level', 'Level the phone'), urgent: off > LEVEL_URGENT }
    }
    // Which way the active camera points: positive = down.
    const cameraDown = facing === 'environment' ? tilt.pitch : -tilt.pitch
    if (shot === 'selfie') {
      if (cameraDown < -15) {
        return {
          cue: cameraCue(
            'angle:selfie-low',
            'Hold the phone at eye level or a little above',
            'Hold the phone at their eye level or a little above',
          ),
          urgent: false,
        }
      }
    } else if (cameraDown > 12) {
      // Looking down at someone from above shortens their legs.
      return {
        cue: cameraCue(
          'angle:down',
          'Lower the phone and hold it upright, pointing down makes legs look shorter',
          'Lower the phone to waist height and hold it upright',
        ),
        urgent: false,
      }
    } else if (cameraDown < -15) {
      return { cue: cameraCue('angle:up', 'Hold the phone upright', 'Hold the phone upright, not tilted up'), urgent: false }
    }
  }

  const { user, anchor } = input
  if (!user || !anchor) return { cue: null, urgent: false }
  const u = anchor.unit
  const H = input.height

  if (shot === 'selfie') {
    const eyes = [user.left_eye, user.right_eye].filter(Boolean) as [number, number][]
    if (eyes.length) {
      const eyeY = eyes.reduce((s, e) => s + e[1], 0) / eyes.length
      if (eyeY > 0.45 * H) {
        return {
          cue: cameraCue(
            'frame:eyes',
            'Raise the phone a little, eyes near the top third',
            'Raise the phone a little so their eyes are near the top third',
          ),
          urgent: false,
        }
      }
    }
    return { cue: null, urgent: false }
  }

  if (user.nose) {
    // Top of the head is roughly 0.3 torso lengths above the nose.
    const headroom = (user.nose[1] - 0.3 * u) / H
    if (headroom > 0.22) {
      return {
        cue: cameraCue(
          'frame:headroom',
          'Lower the phone a little, there is too much space above your head',
          'Lower the phone a little, too much space above their head',
        ),
        urgent: false,
      }
    }
  }

  // Frame edges through a joint look like an amputation; through mid-thigh or mid-shin is fine.
  const knees = (['left', 'right'] as const)
    .map((side) => {
      const knee = user[`${side}_knee`]
      const hip = user[`${side}_hip`]
      return knee?.[1] ?? (hip ? hip[1] + 0.85 * u : undefined)
    })
    .filter((y): y is number => y !== undefined)
  if (shot !== 'full_body' && knees.some((y) => Math.abs(H - y) < 0.12 * u)) {
    return {
      cue: cameraCue(
        'frame:knees',
        "Step back a little so the frame doesn't cut at your knees",
        'Avoid cutting at the knees: move back a little, or frame above them',
      ),
      urgent: false,
    }
  }

  if (shot === 'full_body') {
    const feet = [user.left_ankle, user.right_ankle, user.left_foot_index, user.right_foot_index].filter(
      Boolean,
    ) as [number, number][]
    if (feet.length && Math.max(...feet.map((f) => f[1])) < 0.85 * H) {
      return {
        cue: cameraCue(
          'frame:feet',
          'Lower the phone so your feet are near the bottom, legs look longer',
          'Lower the phone so their feet are near the bottom, legs look longer',
        ),
        urgent: false,
      }
    }
  }

  return { cue: null, urgent: false }
}
