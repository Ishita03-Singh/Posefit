// BlazePose 33-point topology. Our own copy (not MediaPipe's) because templates,
// matching and body analysis in later phases are written against these names.

export interface Keypoint {
  /** Normalized to frame width, 0..1 */
  x: number
  /** Normalized to frame height, 0..1 */
  y: number
  /** Depth relative to hips, roughly same scale as x */
  z: number
  /** 0..1 likelihood the point is visible (not occluded / out of frame) */
  visibility: number
}

export const LANDMARK_NAMES = [
  'nose',
  'left_eye_inner',
  'left_eye',
  'left_eye_outer',
  'right_eye_inner',
  'right_eye',
  'right_eye_outer',
  'left_ear',
  'right_ear',
  'mouth_left',
  'mouth_right',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_pinky',
  'right_pinky',
  'left_index',
  'right_index',
  'left_thumb',
  'right_thumb',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'left_heel',
  'right_heel',
  'left_foot_index',
  'right_foot_index',
] as const

export type LandmarkName = (typeof LANDMARK_NAMES)[number]

export const LM = Object.fromEntries(LANDMARK_NAMES.map((name, i) => [name, i])) as Record<
  LandmarkName,
  number
>

export type Side = 'left' | 'right' | 'center'

export interface Bone {
  from: number
  to: number
  side: Side
}

const bone = (from: LandmarkName, to: LandmarkName, side: Side): Bone => ({
  from: LM[from],
  to: LM[to],
  side,
})

// Body skeleton only; face mesh and finger points are drawn as dots, not bones.
export const BONES: Bone[] = [
  bone('left_shoulder', 'right_shoulder', 'center'),
  bone('left_hip', 'right_hip', 'center'),
  bone('left_shoulder', 'left_hip', 'left'),
  bone('right_shoulder', 'right_hip', 'right'),
  bone('left_shoulder', 'left_elbow', 'left'),
  bone('left_elbow', 'left_wrist', 'left'),
  bone('right_shoulder', 'right_elbow', 'right'),
  bone('right_elbow', 'right_wrist', 'right'),
  bone('left_hip', 'left_knee', 'left'),
  bone('left_knee', 'left_ankle', 'left'),
  bone('right_hip', 'right_knee', 'right'),
  bone('right_knee', 'right_ankle', 'right'),
  bone('left_ankle', 'left_heel', 'left'),
  bone('left_heel', 'left_foot_index', 'left'),
  bone('left_ankle', 'left_foot_index', 'left'),
  bone('right_ankle', 'right_heel', 'right'),
  bone('right_heel', 'right_foot_index', 'right'),
  bone('right_ankle', 'right_foot_index', 'right'),
  bone('left_ear', 'left_eye', 'left'),
  bone('right_ear', 'right_eye', 'right'),
  bone('left_eye', 'nose', 'left'),
  bone('right_eye', 'nose', 'right'),
]

export const VISIBILITY_THRESHOLD = 0.5
