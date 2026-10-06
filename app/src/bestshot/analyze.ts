import { FaceLandmarker } from '@mediapipe/tasks-vision'

import type { BodyPoints } from '../pose/body'
import { dist, mid, type Vec } from '../pose/geometry'
import type { LandmarkName } from '../pose/landmarks'
import { ASSET_BASE, loadFileset } from '../vision/poseDetector'
import { type Eyes, exposure, framingScore, laplacianVariance, type ShotSignals, toGray } from './metrics'

/** What the camera knew at the moment of the shot. Points are in raw (unmirrored) frame pixels. */
export interface ShotContext {
  poseScore: number | null
  points: BodyPoints | null
  mirrored: boolean
}

let facePromise: Promise<FaceLandmarker | null> | null = null

/** Lazily created still-image face landmarker with blendshapes (blink/smile); null if unavailable. */
function faceLandmarker(): Promise<FaceLandmarker | null> {
  facePromise ??= (async () => {
    const fileset = await loadFileset()
    for (const delegate of ['GPU', 'CPU'] as const) {
      try {
        return await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: `${ASSET_BASE}/models/face_landmarker.task`, delegate },
          runningMode: 'IMAGE',
          numFaces: 1,
          outputFaceBlendshapes: true,
        })
      } catch (err) {
        console.warn(`[bestshot] face landmarker (${delegate}) unavailable`, err)
      }
    }
    return null
  })()
  return facePromise
}

/** Points as they appear in the saved photo (selfies are saved mirrored). */
function photoPoints(points: BodyPoints | null, width: number, mirrored: boolean): BodyPoints | null {
  if (!points || !mirrored) return points
  const out: BodyPoints = {}
  for (const [name, p] of Object.entries(points) as [LandmarkName, Vec][]) out[name] = [width - p[0], p[1]]
  return out
}

/** Draws a region of `source` into a small canvas (longest side `size`) and returns it. */
function crop(source: HTMLCanvasElement, x: number, y: number, w: number, h: number, size: number) {
  const s = size / Math.max(w, h)
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * s))
  c.height = Math.max(1, Math.round(h * s))
  c.getContext('2d')!.drawImage(source, x, y, w, h, 0, 0, c.width, c.height)
  return c
}

function bounds(points: BodyPoints | null, width: number, height: number) {
  const pts = points ? (Object.values(points) as Vec[]) : []
  if (pts.length < 3) return { x: 0, y: 0, w: width, h: height }
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const pad = 0.1 * Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const x = Math.max(0, Math.min(...xs) - pad)
  const y = Math.max(0, Math.min(...ys) - 2 * pad) // extra room for the top of the head
  return { x, y, w: Math.min(width, Math.max(...xs) + pad) - x, h: Math.min(height, Math.max(...ys) + pad) - y }
}

/**
 * Face signals from a head-sized crop. The face model expects faces that fill a good part of
 * the image, so in full-body shots it would miss the (small) face without cropping first.
 */
async function faceSignals(photo: HTMLCanvasElement, points: BodyPoints | null): Promise<{ eyes: Eyes; smile: number } | null> {
  const lm = await faceLandmarker()
  if (!lm) return null
  let source = photo
  const { nose, left_ear: le, right_ear: re, left_shoulder: ls, right_shoulder: rs } = points ?? {}
  if (nose) {
    const scale = le && re ? dist(le, re) * 3 : ls && rs ? dist(ls, rs) * 1.4 : photo.width / 4
    const center = le && re ? mid(mid(le, re), nose) : nose
    const x = Math.max(0, center[0] - scale / 2)
    const y = Math.max(0, center[1] - scale / 2)
    source = crop(photo, x, y, Math.min(scale, photo.width - x), Math.min(scale, photo.height - y), 384)
  }
  const categories = lm.detect(source).faceBlendshapes[0]?.categories
  if (!categories) return null
  const score = (name: string) => categories.find((c) => c.categoryName === name)?.score ?? 0
  const closed = [score('eyeBlinkLeft'), score('eyeBlinkRight')].filter((v) => v > 0.5).length
  return {
    eyes: closed === 0 ? 'open' : closed === 1 ? 'one-closed' : 'closed',
    smile: (score('mouthSmileLeft') + score('mouthSmileRight')) / 2,
  }
}

/** Measures one captured photo. Runs after capture, off the camera loop. */
export async function analyzeShot(photo: HTMLCanvasElement, ctx: ShotContext): Promise<ShotSignals> {
  const { width, height } = photo
  const points = photoPoints(ctx.points, width, ctx.mirrored)

  // Sharpness and exposure on the person, downscaled: what matters is how it looks on a phone.
  const b = bounds(points, width, height)
  const small = crop(photo, b.x, b.y, b.w, b.h, 256)
  const data = small.getContext('2d')!.getImageData(0, 0, small.width, small.height).data
  const gray = toGray(data, small.width, small.height)

  let face: Awaited<ReturnType<typeof faceSignals>> = null
  try {
    face = await faceSignals(photo, points)
  } catch (err) {
    console.warn('[bestshot] face analysis failed', err)
  }

  return {
    pose: ctx.poseScore,
    eyes: face?.eyes ?? null,
    smile: face?.smile ?? null,
    sharpness: laplacianVariance(gray, small.width, small.height),
    exposure: exposure(gray),
    framing: framingScore(points, width, height),
  }
}
