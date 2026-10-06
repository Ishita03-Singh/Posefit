import type { BodyPoints } from './body'
import { add, dist, mid, scale, sub, type Vec } from './geometry'
import type { LandmarkName } from './landmarks'
import { type Segment, STANDARD } from './profile'

/**
 * The person's own body shape, measured once from the segmentation mask in a neutral A-pose
 * (the body scan) and used to draw the ghost as *their* silhouette in the target pose.
 *
 * All values are in torso lengths (mid-shoulder to mid-hip), so they apply at any distance.
 * Only these numbers are kept (in localStorage); no image is stored.
 */
export interface BodyShape {
  version: 1
  /** Half-widths of the torso from its centre line. */
  torso: { shoulders: number; chest: number; waist: number; hips: number }
  /** Half-width of the neck. */
  neck: number
  head: { halfWidth: number; /** nose to top of head */ top: number }
  /** Radius at the start and end of each limb segment. */
  upperArm: [number, number]
  forearm: [number, number]
  thigh: [number, number]
  shin: [number, number]
  /** Segment length / torso length. */
  lengths: Partial<Record<Segment, number>>
}

export const DEFAULT_SHAPE: BodyShape = {
  version: 1,
  torso: { shoulders: 0.47, chest: 0.4, waist: 0.31, hips: 0.37 },
  neck: 0.085,
  head: { halfWidth: 0.2, top: 0.33 },
  upperArm: [0.085, 0.065],
  forearm: [0.062, 0.048],
  thigh: [0.15, 0.1],
  shin: [0.095, 0.06],
  lengths: {},
}

/** Positions along the shoulder→hip axis where the torso is measured. */
export const TORSO_T = { shoulders: 0.06, chest: 0.3, waist: 0.62, hips: 0.92 } as const

export interface MaskView {
  data: Float32Array
  width: number
  height: number
}

const norm = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1]) || 1
  return [v[0] / l, v[1] / l]
}

/**
 * Distance (pixels, in frame space) from `origin` along `dir` to the edge of the person,
 * or null if the origin isn't on the person or no edge is found within `maxLen`
 * (e.g. an arm resting against the torso makes the torso edge unmeasurable).
 */
function extent(mask: MaskView, sx: number, sy: number, origin: Vec, dir: Vec, maxLen: number): number | null {
  const at = (p: Vec) => {
    const x = Math.round(p[0] * sx)
    const y = Math.round(p[1] * sy)
    if (x < 0 || y < 0 || x >= mask.width || y >= mask.height) return false
    return mask.data[y * mask.width + x] > 0.5
  }
  if (!at(origin)) return null
  const step = 1 / Math.max(sx, sy)
  for (let d = step; d <= maxLen; d += step) {
    if (!at(add(origin, scale(dir, d)))) return d
  }
  return null
}

type Sample = Record<string, number>

/** One frame's measurements (torso units). Missing keys = couldn't be measured this frame. */
export function measure(mask: MaskView, p: BodyPoints, frameWidth: number, frameHeight: number): Sample | null {
  const { left_shoulder: ls, right_shoulder: rs, left_hip: lh, right_hip: rh, nose } = p
  if (!ls || !rs || !lh || !rh) return null
  const sx = mask.width / frameWidth
  const sy = mask.height / frameHeight
  const midS = mid(ls, rs)
  const midH = mid(lh, rh)
  const u = dist(midS, midH)
  if (u < 20) return null
  const down = norm(sub(midH, midS))
  const across: Vec = [down[1], -down[0]] // toward the person's left (+x when upright)
  const out: Sample = {}

  const halfWidth = (center: Vec, dir: Vec, maxLen: number): number | null => {
    const a = extent(mask, sx, sy, center, dir, maxLen)
    const b = extent(mask, sx, sy, center, scale(dir, -1), maxLen)
    return a !== null && b !== null ? (a + b) / 2 : null
  }

  for (const [name, t] of Object.entries(TORSO_T)) {
    const w = halfWidth(add(midS, scale(down, t * u)), across, 0.9 * u)
    if (w !== null) out[`torso.${name}`] = w / u
  }

  if (nose) {
    const neck = halfWidth(add(midS, scale(sub(nose, midS), 0.3)), across, 0.3 * u)
    if (neck !== null) out.neck = neck / u
    const ears = p.left_ear && p.right_ear ? mid(p.left_ear, p.right_ear) : nose
    const head = halfWidth(ears, across, 0.5 * u)
    if (head !== null) out['head.halfWidth'] = head / u
    const top = extent(mask, sx, sy, nose, scale(down, -1), 0.8 * u)
    if (top !== null) out['head.top'] = top / u
  }

  const limb = (key: string, side: string, a: LandmarkName, b: LandmarkName) => {
    const pa = p[a]
    const pb = p[b]
    if (!pa || !pb) return
    const d = norm(sub(pb, pa))
    const n: Vec = [-d[1], d[0]]
    const len = dist(pa, pb)
    for (const [i, t] of [0.25, 0.75].entries()) {
      const r = halfWidth(add(pa, scale(d, t * len)), n, 0.35 * u)
      if (r !== null) out[`${key}.${i}.${side}`] = r / u
    }
  }
  for (const side of ['left', 'right'] as const) {
    limb('upperArm', side, `${side}_shoulder`, `${side}_elbow`)
    limb('forearm', side, `${side}_elbow`, `${side}_wrist`)
    limb('thigh', side, `${side}_hip`, `${side}_knee`)
    limb('shin', side, `${side}_knee`, `${side}_ankle`)
  }

  const len = (key: Segment, a: LandmarkName, b: LandmarkName) => {
    if (p[a] && p[b]) out[`len.${key}.${a}`] = dist(p[a]!, p[b]!) / u
  }
  len('shoulderWidth', 'left_shoulder', 'right_shoulder')
  len('hipWidth', 'left_hip', 'right_hip')
  for (const side of ['left', 'right'] as const) {
    len('upperArm', `${side}_shoulder`, `${side}_elbow`)
    len('forearm', `${side}_elbow`, `${side}_wrist`)
    len('thigh', `${side}_hip`, `${side}_knee`)
    len('shin', `${side}_knee`, `${side}_ankle`)
  }
  return out
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

const MIN_SAMPLES = 5

/** Collects per-frame measurements and reduces them to a BodyShape (median per value). */
export class ShapeScanner {
  private samples: Sample[] = []

  readonly target: number

  constructor(target = 24) {
    this.target = target
  }

  get count(): number {
    return this.samples.length
  }

  get progress(): number {
    return Math.min(1, this.samples.length / this.target)
  }

  add(sample: Sample): void {
    this.samples.push(sample)
  }

  reset(): void {
    this.samples = []
  }

  result(): BodyShape {
    // Median over every key starting with `prefix` (pools left/right sides).
    const pool = (prefix: string): number | undefined => {
      const v = this.samples.flatMap((s) => Object.entries(s).filter(([k]) => k.startsWith(prefix)).map(([, x]) => x))
      return v.length >= MIN_SAMPLES ? median(v) : undefined
    }
    const pick = (key: string, fallback: number): number => pool(key) ?? fallback
    const d = DEFAULT_SHAPE
    const lengths: BodyShape['lengths'] = {}
    for (const seg of Object.keys(STANDARD) as Segment[]) {
      const v = pool(`len.${seg}.`)
      if (v !== undefined) lengths[seg] = v
    }
    return {
      version: 1,
      torso: {
        shoulders: pick('torso.shoulders', d.torso.shoulders),
        chest: pick('torso.chest', d.torso.chest),
        waist: pick('torso.waist', d.torso.waist),
        hips: pick('torso.hips', d.torso.hips),
      },
      neck: pick('neck', d.neck),
      head: { halfWidth: pick('head.halfWidth', d.head.halfWidth), top: pick('head.top', d.head.top) },
      upperArm: [pick('upperArm.0.', d.upperArm[0]), pick('upperArm.1.', d.upperArm[1])],
      forearm: [pick('forearm.0.', d.forearm[0]), pick('forearm.1.', d.forearm[1])],
      thigh: [pick('thigh.0.', d.thigh[0]), pick('thigh.1.', d.thigh[1])],
      shin: [pick('shin.0.', d.shin[0]), pick('shin.1.', d.shin[1])],
      lengths,
    }
  }
}

const STORAGE_KEY = 'posefit.bodyShape.v1'

export function loadShape(): BodyShape | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const shape = raw ? (JSON.parse(raw) as BodyShape) : null
    return shape?.version === 1 ? shape : null
  } catch {
    return null
  }
}

export function saveShape(shape: BodyShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shape))
  } catch {
    // Private mode / storage blocked: the shape still applies for this session.
  }
}

export function clearShape(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
