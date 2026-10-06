import { AMBER, GREEN, SCORED_BONES } from '../match/match'
import type { BodyPoints } from '../pose/body'
import { add, clamp, dist, mid, scale, sub, type Vec } from '../pose/geometry'
import { STANDARD } from '../pose/profile'
import { type BodyShape, DEFAULT_SHAPE, TORSO_T } from '../pose/shape'

/**
 * Soft, filled body silhouette for the target pose (the "ghost"), drawn with the person's own
 * measured body shape (see pose/shape.ts) so it looks like *them* in the target pose.
 *
 * All body parts are first drawn opaque onto an offscreen mask, so overlapping parts merge
 * into one clean shape; the mask is then composited translucently, with a glowing outline
 * made by dilating the mask a few pixels and cutting the original out of it.
 */

export interface BodyStyle {
  /** Per SCORED_BONES index (null = not scored); tints limbs that need fixing. */
  boneScores: (number | null)[] | null
  matched: boolean
  shape?: BodyShape
}

// Hands and feet aren't measured (too small / often cropped); sizes in torso lengths.
const HAND = 0.07
const FOOT: [number, number] = [0.055, 0.035]

const WHITE = '255, 255, 255'
const MATCH = '80, 220, 120'
const AMBER_RGB = '255, 196, 61'
const RED_RGB = '255, 99, 99'

// Mask is rendered at reduced resolution: cheaper, and the slight softness suits a ghost.
const MASK_SCALE = 0.5

let mask: HTMLCanvasElement | null = null
let ring: HTMLCanvasElement | null = null

function offscreen(existing: HTMLCanvasElement | null, w: number, h: number): HTMLCanvasElement {
  const c = existing ?? document.createElement('canvas')
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
  return c
}

const norm = (v: Vec): Vec => {
  const l = Math.hypot(v[0], v[1]) || 1
  return [v[0] / l, v[1] / l]
}
const lerp = (a: Vec, b: Vec, t: number): Vec => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Tapered capsule from a (radius ra) to b (radius rb). */
function taper(ctx: CanvasRenderingContext2D, a: Vec, b: Vec, ra: number, rb: number): void {
  const d = norm(sub(b, a))
  const n: Vec = [-d[1], d[0]]
  ctx.beginPath()
  ctx.moveTo(a[0] + n[0] * ra, a[1] + n[1] * ra)
  ctx.lineTo(b[0] + n[0] * rb, b[1] + n[1] * rb)
  ctx.lineTo(b[0] - n[0] * rb, b[1] - n[1] * rb)
  ctx.lineTo(a[0] - n[0] * ra, a[1] - n[1] * ra)
  ctx.closePath()
  ctx.fill()
  for (const [c, r] of [
    [a, ra],
    [b, rb],
  ] as [Vec, number][]) {
    ctx.beginPath()
    ctx.arc(c[0], c[1], r, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Closed smooth curve through points (Catmull-Rom converted to cubic Béziers). */
function smoothClosed(ctx: CanvasRenderingContext2D, pts: Vec[]): void {
  const n = pts.length
  ctx.beginPath()
  ctx.moveTo(pts[0][0], pts[0][1])
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6,
      p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6,
      p2[1] - (p3[1] - p1[1]) / 6,
      p2[0],
      p2[1],
    )
  }
  ctx.closePath()
  ctx.fill()
}

interface Frame {
  ls: Vec
  rs: Vec
  lh: Vec
  rh: Vec
  midShoulder: Vec
  midHip: Vec
  /** Toward the person's left, at shoulder and hip height. */
  acrossS: Vec
  acrossH: Vec
  /** Shoulders toward hips. */
  down: Vec
}

/** Torso frame; hips are synthesized below the shoulders when not in the pose (selfies). */
function torsoFrame(p: BodyPoints, u: number): Frame | null {
  const { left_shoulder: ls, right_shoulder: rs } = p
  if (!ls || !rs) return null
  const midShoulder = mid(ls, rs)
  const acrossS = dist(ls, rs) > 0.1 * u ? norm(sub(ls, rs)) : ([1, 0] as Vec)
  let lh = p.left_hip
  let rh = p.right_hip
  if (!lh || !rh) {
    const below = add(midShoulder, scale([-acrossS[1], acrossS[0]], u))
    lh = add(below, scale(acrossS, 0.2 * u))
    rh = add(below, scale(acrossS, -0.2 * u))
  }
  const midHip = mid(lh, rh)
  const acrossH = dist(lh, rh) > 0.05 * u ? norm(sub(lh, rh)) : acrossS
  return { ls, rs, lh, rh, midShoulder, midHip, acrossS, acrossH, down: norm(sub(midHip, midShoulder)) }
}

/**
 * Torso outline from the person's measured half-widths along the shoulder→hip axis.
 * `squash` < 1 narrows it for poses where the body is turned away from the camera.
 */
function torsoOutline(f: Frame, u: number, shape: BodyShape, squash: number): Vec[] {
  const w = shape.torso
  const axis = (t: number) => lerp(f.midShoulder, f.midHip, t)
  const side = (s: 1 | -1): Vec[] => {
    const across = (t: number) => scale(norm(lerp(f.acrossS, f.acrossH, t)), s)
    const at = (t: number, half: number): Vec => add(axis(t), scale(across(t), half * u * squash))
    const up = scale(f.down, -0.045 * u)
    return [
      add(add(f.midShoulder, scale(across(0), shape.neck * 1.25 * u)), up), // neck base
      add(add(f.midShoulder, scale(across(0), w.shoulders * 0.8 * u * squash)), up), // top of shoulder
      at(TORSO_T.shoulders, w.shoulders),
      at(TORSO_T.chest, w.chest),
      at(TORSO_T.waist, w.waist),
      at(TORSO_T.hips, w.hips),
      at(1.08, w.hips * 0.92), // upper thigh
    ]
  }
  const crotch = add(f.midHip, scale(f.down, 0.15 * u))
  return [...side(1), crotch, ...side(-1).reverse()]
}

function drawHead(ctx: CanvasRenderingContext2D, p: BodyPoints, f: Frame, u: number, shape: BodyShape): void {
  if (!p.nose) return
  const sides = [p.left_ear, p.right_ear, p.left_eye, p.right_eye].filter(Boolean) as Vec[]
  // Ears sit at mid-head height, so the face landmarks' centre is close to the head's centre.
  const center = sides.length ? scale(sides.reduce(add), 1 / sides.length) : p.nose
  const rx = shape.head.halfWidth * u
  const ry = Math.max(rx * 1.15, shape.head.top * u - dist(p.nose, center))
  const eyeLine = p.left_ear && p.right_ear ? sub(p.left_ear, p.right_ear) : f.acrossS
  const tilt = Math.atan2(eyeLine[1], eyeLine[0])

  // "Down" in the head's own frame: (0, 1) rotated by the head tilt.
  const chin = add(center, scale([-Math.sin(tilt), Math.cos(tilt)], ry * 0.85))
  taper(ctx, f.midShoulder, chin, shape.neck * u * 1.1, shape.neck * u)
  ctx.beginPath()
  ctx.ellipse(center[0], center[1], rx, ry, tilt, 0, Math.PI * 2)
  ctx.fill()
}

function limbRadii(shape: BodyShape, part: 'elbow' | 'hand' | 'knee' | 'foot'): [number, number] {
  return part === 'elbow' ? shape.upperArm : part === 'hand' ? shape.forearm : part === 'knee' ? shape.thigh : shape.shin
}

function drawLimbs(ctx: CanvasRenderingContext2D, p: BodyPoints, u: number, shape: BodyShape): void {
  for (const side of ['left', 'right'] as const) {
    const sh = p[`${side}_shoulder`]
    const el = p[`${side}_elbow`]
    const wr = p[`${side}_wrist`]
    if (sh && el) taper(ctx, sh, el, shape.upperArm[0] * u, shape.upperArm[1] * u)
    if (el && wr) {
      taper(ctx, el, wr, shape.forearm[0] * u, shape.forearm[1] * u)
      const hand = add(wr, scale(norm(sub(wr, el)), 0.07 * u))
      ctx.beginPath()
      ctx.ellipse(hand[0], hand[1], HAND * u * 0.8, HAND * u, Math.atan2(wr[1] - el[1], wr[0] - el[0]) - Math.PI / 2, 0, Math.PI * 2)
      ctx.fill()
    }

    const hp = p[`${side}_hip`]
    const kn = p[`${side}_knee`]
    const an = p[`${side}_ankle`]
    if (hp && kn) taper(ctx, hp, kn, shape.thigh[0] * u, shape.thigh[1] * u)
    if (kn && an) taper(ctx, kn, an, shape.shin[0] * u, shape.shin[1] * u)
    const toe = p[`${side}_foot_index`]
    if (an && toe) taper(ctx, an, toe, FOOT[0] * u, FOOT[1] * u)
    const heel = p[`${side}_heel`]
    if (an && heel) taper(ctx, an, heel, FOOT[0] * u, FOOT[0] * u * 0.9)
  }
}

/** How much the pose's shoulders are narrowed relative to this person's (body turned away). */
function turnSquash(f: Frame, u: number, shape: BodyShape): number {
  const own = (shape.lengths.shoulderWidth ?? STANDARD.shoulderWidth) * u
  return clamp(dist(f.ls, f.rs) / own, 0.4, 1)
}

/** Opaque silhouette of the whole body onto ctx (any fill style). */
function drawSilhouette(ctx: CanvasRenderingContext2D, p: BodyPoints, u: number, shape: BodyShape): void {
  const f = torsoFrame(p, u)
  if (!f) return
  smoothClosed(ctx, torsoOutline(f, u, shape, turnSquash(f, u, shape)))
  drawHead(ctx, p, f, u, shape)
  drawLimbs(ctx, p, u, shape)
}

/** Limb segments per scored bone, for tinting the parts that need fixing. */
function drawBoneTints(
  ctx: CanvasRenderingContext2D,
  p: BodyPoints,
  u: number,
  scores: (number | null)[],
  shape: BodyShape,
): void {
  SCORED_BONES.forEach((bone, i) => {
    const s = scores[i]
    if (s === null || s >= GREEN || bone.part === 'torso') return
    ctx.fillStyle = `rgba(${s >= AMBER ? AMBER_RGB : RED_RGB}, 0.55)`
    if (bone.part === 'head') {
      if (p.nose) {
        ctx.beginPath()
        ctx.arc(p.nose[0], p.nose[1] - 0.05 * u, shape.head.halfWidth * 0.8 * u, 0, Math.PI * 2)
        ctx.fill()
      }
      return
    }
    const a = p[bone.from as keyof BodyPoints]
    const b = p[bone.to as keyof BodyPoints]
    if (!a || !b) return
    const r = limbRadii(shape, bone.part)
    taper(ctx, a, b, r[0] * u * 0.9, r[1] * u * 0.9)
  })
}

export function drawBody(ctx: CanvasRenderingContext2D, points: BodyPoints, unit: number, style: BodyStyle): void {
  const shape = style.shape ?? DEFAULT_SHAPE
  const { width, height } = ctx.canvas
  const mw = Math.max(1, Math.round(width * MASK_SCALE))
  const mh = Math.max(1, Math.round(height * MASK_SCALE))
  mask = offscreen(mask, mw, mh)
  ring = offscreen(ring, mw, mh)
  const m = mask.getContext('2d')
  const r = ring.getContext('2d')
  if (!m || !r) return

  // 1. Opaque silhouette mask.
  m.globalCompositeOperation = 'source-over'
  m.clearRect(0, 0, mw, mh)
  m.save()
  m.scale(MASK_SCALE, MASK_SCALE)
  m.fillStyle = '#fff'
  drawSilhouette(m, points, unit, shape)
  m.restore()

  // 2. Outline ring: dilate the mask by stamping it around a circle, then cut the mask out.
  const t = Math.max(1.5, unit * MASK_SCALE * 0.018)
  r.globalCompositeOperation = 'source-over'
  r.clearRect(0, 0, mw, mh)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2
    r.drawImage(mask, Math.cos(a) * t, Math.sin(a) * t)
  }
  r.globalCompositeOperation = 'destination-out'
  r.drawImage(mask, 0, 0)

  // 3. Tint both.
  const rgb = style.matched ? MATCH : WHITE
  for (const c of [m, r]) {
    c.globalCompositeOperation = 'source-in'
    c.fillStyle = `rgb(${rgb})`
    c.fillRect(0, 0, mw, mh)
    c.globalCompositeOperation = 'source-over'
  }

  // 4. Composite: translucent body, glowing outline, then tints on limbs to fix.
  ctx.save()
  ctx.imageSmoothingEnabled = true
  ctx.globalAlpha = style.matched ? 0.34 : 0.26
  ctx.drawImage(mask, 0, 0, width, height)
  ctx.globalAlpha = 0.95
  ctx.shadowColor = `rgba(${rgb}, 0.9)`
  ctx.shadowBlur = Math.max(6, unit * 0.05)
  ctx.drawImage(ring, 0, 0, width, height)
  ctx.restore()

  if (style.boneScores && !style.matched) drawBoneTints(ctx, points, unit, style.boneScores, shape)
}
