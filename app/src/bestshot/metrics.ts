import type { BodyPoints } from '../pose/body'
import type { Vec } from '../pose/geometry'

/**
 * Best Shots scoring: pure functions over measurements of each photo in a burst, so the
 * ranking logic is testable without a camera. analyze.ts gathers the measurements.
 */

export type Eyes = 'open' | 'one-closed' | 'closed'

export interface ShotSignals {
  /** Pose match 0..100 at the moment of capture; null for manual shots without a guide. */
  pose: number | null
  /** null when no face was found (e.g. turned away, too small). */
  eyes: Eyes | null
  /** 0..1 */
  smile: number | null
  /** Variance of the Laplacian around the person; higher = sharper. */
  sharpness: number
  exposure: Exposure
  /** 0..1, person fully in frame and reasonably centred; null when no person was tracked. */
  framing: number | null
}

export interface Exposure {
  /** Mean luminance 0..1. */
  mean: number
  /** Fractions of near-black / near-white pixels. */
  dark: number
  bright: number
}

export interface Note {
  text: string
  tone: 'good' | 'warn'
}

export interface ShotScore {
  /** 0..1 */
  total: number
  notes: Note[]
}

/** Luminance (0..1) per pixel from RGBA ImageData-like data. */
export function toGray(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const out = new Float32Array(width * height)
  for (let i = 0; i < out.length; i++) {
    const j = i * 4
    out[i] = (0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]) / 255
  }
  return out
}

/**
 * Variance of the 4-neighbour Laplacian (on a 0..255 scale): the standard cheap blur metric.
 * Motion blur and missed focus remove the fine edges it responds to.
 */
export function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const v = 255 * (gray[i - 1] + gray[i + 1] + gray[i - width] + gray[i + width] - 4 * gray[i])
      sum += v
      sumSq += v * v
      n++
    }
  }
  if (n === 0) return 0
  const mean = sum / n
  return sumSq / n - mean * mean
}

export function exposure(gray: Float32Array): Exposure {
  let sum = 0
  let dark = 0
  let bright = 0
  for (const v of gray) {
    sum += v
    if (v < 0.04) dark++
    else if (v > 0.96) bright++
  }
  const n = gray.length || 1
  return { mean: sum / n, dark: dark / n, bright: bright / n }
}

/** Person fully inside the frame (with a small margin) and near the horizontal centre. */
export function framingScore(points: BodyPoints | null, width: number, height: number): number | null {
  const pts = points ? (Object.values(points) as Vec[]) : []
  if (pts.length === 0) return null
  const inside =
    pts.filter((p) => p[0] > 0.02 * width && p[0] < 0.98 * width && p[1] > 0.01 * height && p[1] < 0.99 * height).length /
    pts.length
  const meanX = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const offCentre = Math.min(1, (Math.abs(meanX - width / 2) / (width / 2)) * 1.5)
  return inside * 0.7 + (1 - offCentre) * 0.3
}

/** Below this the photo reads as soft at phone-screen size (downscaled crop, 0..255 scale). */
export const BLUR_THRESHOLD = 40

const WEIGHTS = { pose: 0.35, eyes: 0.2, sharp: 0.2, smile: 0.1, framing: 0.1, exposure: 0.05 }

export function scoreShot(s: ShotSignals, burstMaxSharpness: number): ShotScore {
  const notes: Note[] = []

  const pose = s.pose === null ? 0.7 : s.pose / 100
  if (s.pose !== null && s.pose >= 85) notes.push({ text: `Great pose ${Math.round(s.pose)}%`, tone: 'good' })

  const eyes = s.eyes === null ? 0.8 : s.eyes === 'open' ? 1 : s.eyes === 'one-closed' ? 0.4 : 0
  if (s.eyes === 'closed') notes.push({ text: 'Eyes closed', tone: 'warn' })
  else if (s.eyes === 'one-closed') notes.push({ text: 'Mid-blink', tone: 'warn' })

  // Relative to the burst (same scene and light), with an absolute floor for genuinely soft shots.
  const relative = burstMaxSharpness > 0 ? s.sharpness / burstMaxSharpness : 1
  const absolute = Math.min(1, s.sharpness / BLUR_THRESHOLD)
  const sharp = 0.6 * relative + 0.4 * absolute
  if (s.sharpness < BLUR_THRESHOLD) notes.push({ text: 'Blurry', tone: 'warn' })
  else if (relative > 0.97 && burstMaxSharpness > 0) notes.push({ text: 'Sharpest', tone: 'good' })

  const smile = s.smile ?? 0.3
  if (s.smile !== null && s.smile > 0.5) notes.push({ text: 'Smiling', tone: 'good' })

  const framing = s.framing ?? 0.5
  if (s.framing !== null && s.framing < 0.75) notes.push({ text: 'Partly out of frame', tone: 'warn' })

  const { mean, dark, bright } = s.exposure
  let expo = 1 - Math.min(1, Math.abs(mean - 0.5) * 1.6) - dark - bright
  expo = Math.max(0, expo)
  if (mean < 0.18 || dark > 0.25) notes.push({ text: 'Too dark', tone: 'warn' })
  else if (mean > 0.85 || bright > 0.25) notes.push({ text: 'Too bright', tone: 'warn' })

  const total =
    WEIGHTS.pose * pose +
    WEIGHTS.eyes * eyes +
    WEIGHTS.sharp * sharp +
    WEIGHTS.smile * smile +
    WEIGHTS.framing * framing +
    WEIGHTS.exposure * expo
  return { total, notes }
}

/** Scores every shot in a burst (sharpness is judged relative to the sharpest one). */
export function rankBurst(signals: ShotSignals[]): ShotScore[] {
  const max = Math.max(0, ...signals.map((s) => s.sharpness))
  return signals.map((s) => scoreShot(s, max))
}
