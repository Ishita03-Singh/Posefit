import { BONES, type Keypoint, type Side, VISIBILITY_THRESHOLD } from '../pose/landmarks'

const SIDE_COLORS: Record<Side, string> = {
  left: '#4fc3f7',
  right: '#ff8a65',
  center: '#ffffff',
}

/** Draws the pose skeleton onto a canvas whose pixel size matches the video frame. */
export function drawSkeleton(ctx: CanvasRenderingContext2D, keypoints: Keypoint[]): void {
  const { width, height } = ctx.canvas
  const unit = Math.min(width, height) / 160

  ctx.lineCap = 'round'
  ctx.lineWidth = unit * 1.2
  for (const { from, to, side } of BONES) {
    const a = keypoints[from]
    const b = keypoints[to]
    if (a.visibility < VISIBILITY_THRESHOLD || b.visibility < VISIBILITY_THRESHOLD) continue
    ctx.strokeStyle = SIDE_COLORS[side]
    ctx.beginPath()
    ctx.moveTo(a.x * width, a.y * height)
    ctx.lineTo(b.x * width, b.y * height)
    ctx.stroke()
  }

  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)'
  ctx.lineWidth = unit * 0.4
  for (const p of keypoints) {
    if (p.visibility < VISIBILITY_THRESHOLD) continue
    ctx.beginPath()
    ctx.arc(p.x * width, p.y * height, unit, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }
}
