import type { Ghost } from '../match/fit'
import { SCORED_BONES } from '../match/match'
import { dist, mid, type Vec } from '../pose/geometry'
import { BONES, boneNames, type LandmarkName } from '../pose/landmarks'

const NEUTRAL = 'rgba(255, 255, 255, 0.8)'

function colorFor(score: number | undefined): string {
  if (score === undefined) return NEUTRAL
  if (score >= 0.8) return 'rgba(80, 220, 120, 0.9)'
  if (score >= 0.5) return 'rgba(255, 196, 61, 0.9)'
  return 'rgba(255, 99, 99, 0.9)'
}

/**
 * Draws the target pose as a soft "ghost" outline. Bones the matcher scored are tinted
 * green / amber / red so the person can see which limb to fix without reading.
 */
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  ghost: Ghost,
  boneScores: (number | null)[] | null,
  keyJoints: LandmarkName[],
): void {
  const p = ghost.points
  const unit = ghost.anchor.unit
  const width = Math.max(unit * 0.065, 3)

  // Score per drawn bone (by "from-to" name), plus the torso score for the body outline.
  const scoreByBone = new Map<string, number>()
  let torsoScore: number | undefined
  if (boneScores) {
    SCORED_BONES.forEach((b, i) => {
      const s = boneScores[i]
      if (s === null) return
      if (b.part === 'torso') torsoScore = s
      scoreByBone.set(`${b.from}-${b.to}`, s)
    })
  }

  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)'
  ctx.shadowBlur = width

  // Head and neck.
  if (p.nose && p.left_shoulder && p.right_shoulder) {
    const ears = p.left_ear && p.right_ear
    const center: Vec = ears ? [(p.left_ear![0] + p.right_ear![0] + p.nose[0]) / 3, (p.left_ear![1] + p.right_ear![1] + p.nose[1]) / 3] : p.nose
    const radius = ears ? dist(p.left_ear!, p.right_ear!) * 0.62 : unit * 0.19
    const neck = mid(p.left_shoulder, p.right_shoulder)
    ctx.strokeStyle = colorFor(scoreByBone.get('mid_shoulder-nose'))
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.arc(center[0], center[1], radius, 0, Math.PI * 2)
    ctx.moveTo(neck[0], neck[1])
    ctx.lineTo(center[0], center[1] + radius)
    ctx.stroke()
  }

  for (const bone of BONES) {
    const [a, b] = boneNames(bone)
    if (a.includes('eye') || b.includes('eye') || a.includes('ear')) continue // face drawn as head circle
    const pa = p[a]
    const pb = p[b]
    if (!pa || !pb) continue
    const isTorso = (a.includes('shoulder') || a.includes('hip')) && (b.includes('shoulder') || b.includes('hip'))
    ctx.strokeStyle = colorFor(isTorso ? torsoScore : scoreByBone.get(`${a}-${b}`))
    ctx.lineWidth = width
    ctx.beginPath()
    ctx.moveTo(pa[0], pa[1])
    ctx.lineTo(pb[0], pb[1])
    ctx.stroke()
  }

  // Key joints: the part of the pose that matters most.
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
  for (const name of keyJoints) {
    const q = p[name]
    if (!q) continue
    ctx.beginPath()
    ctx.arc(q[0], q[1], width * 0.9, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
