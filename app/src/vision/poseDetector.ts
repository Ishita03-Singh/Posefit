import { FilesetResolver, PoseLandmarker } from '@mediapipe/tasks-vision'

export type ModelVariant = 'lite' | 'full'
export type Delegate = 'GPU' | 'CPU'

export interface PoseDetector {
  landmarker: PoseLandmarker
  delegate: Delegate
  variant: ModelVariant
}

export const ASSET_BASE = `${import.meta.env.BASE_URL}mediapipe`

let filesetPromise: ReturnType<typeof FilesetResolver.forVisionTasks> | null = null

export function loadFileset() {
  filesetPromise ??= FilesetResolver.forVisionTasks(`${ASSET_BASE}/wasm`)
  return filesetPromise
}

/**
 * Creates a single-person pose landmarker, preferring the GPU and falling back to CPU.
 * VIDEO mode tracks across frames (camera); IMAGE mode handles independent stills (photos).
 */
export async function createPoseDetector(
  variant: ModelVariant,
  runningMode: 'VIDEO' | 'IMAGE' = 'VIDEO',
): Promise<PoseDetector> {
  const fileset = await loadFileset()
  const modelAssetPath = `${ASSET_BASE}/models/pose_landmarker_${variant}.task`

  for (const delegate of ['GPU', 'CPU'] as const) {
    try {
      const landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode,
        numPoses: 1,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      })
      return { landmarker, delegate, variant }
    } catch (err) {
      if (delegate === 'CPU') throw err
      console.warn('[pose] GPU delegate unavailable, falling back to CPU', err)
    }
  }
  throw new Error('unreachable')
}
