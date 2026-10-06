import { SIDE_COLORS } from '../overlay/drawSkeleton'
import { BONES, boneNames } from '../pose/landmarks'
import type { Point2, PoseTemplate } from '../pose/template'

interface Props {
  template: PoseTemplate
  /** Mirror horizontally, e.g. to preview how a pose looks on the selfie camera. */
  mirrored?: boolean
}

const PAD = 0.25

/** Stick figure of a template with a head circle, scaled to fit its box. */
export function TemplateFigure({ template, mirrored = false }: Props) {
  const kp = template.keypoints
  const points = Object.values(kp) as Point2[]

  const head = headCircle(template)
  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  if (head) {
    xs.push(head.cx - head.r, head.cx + head.r)
    ys.push(head.cy - head.r, head.cy + head.r)
  }
  const minX = Math.min(...xs) - PAD
  const minY = Math.min(...ys) - PAD
  const width = Math.max(...xs) + PAD - minX
  const height = Math.max(...ys) + PAD - minY
  const stroke = Math.max(width, height) / 70

  const neckBase = mid(kp.left_shoulder!, kp.right_shoulder!)

  return (
    <svg
      className="figure"
      viewBox={`${minX} ${minY} ${width} ${height}`}
      role="img"
      aria-label={`${template.name} pose`}
      style={mirrored ? { transform: 'scaleX(-1)' } : undefined}
    >
      {head && (
        <g className="figure-head" strokeWidth={stroke}>
          <line x1={neckBase[0]} y1={neckBase[1]} x2={head.cx} y2={head.cy + head.r} />
          <circle cx={head.cx} cy={head.cy} r={head.r} />
        </g>
      )}
      {BONES.map((bone) => {
        const [a, b] = boneNames(bone).map((n) => kp[n])
        if (!a || !b) return null
        return (
          <line
            key={`${bone.from}-${bone.to}`}
            x1={a[0]}
            y1={a[1]}
            x2={b[0]}
            y2={b[1]}
            stroke={SIDE_COLORS[bone.side]}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        )
      })}
      {template.key_joints.map((name) => {
        const p = kp[name]
        return p ? <circle key={name} className="figure-key" cx={p[0]} cy={p[1]} r={stroke * 1.4} /> : null
      })}
    </svg>
  )
}

function mid(a: Point2, b: Point2): Point2 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

function headCircle({ keypoints: kp }: PoseTemplate) {
  if (!kp.nose) return null
  if (kp.left_ear && kp.right_ear) {
    return {
      cx: (kp.left_ear[0] + kp.right_ear[0] + kp.nose[0]) / 3,
      cy: (kp.left_ear[1] + kp.right_ear[1] + kp.nose[1]) / 3,
      r: Math.hypot(kp.left_ear[0] - kp.right_ear[0], kp.left_ear[1] - kp.right_ear[1]) * 0.62,
    }
  }
  return { cx: kp.nose[0], cy: kp.nose[1], r: 0.19 }
}
