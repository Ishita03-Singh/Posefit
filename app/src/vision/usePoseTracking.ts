import { type RefObject, useEffect, useRef, useState } from 'react'

import { type Keypoint, VISIBILITY_THRESHOLD } from '../pose/landmarks'
import type { MaskView } from '../pose/shape'
import type { PoseDetector } from './poseDetector'

export interface TrackingStats {
  fps: number
  inferenceMs: number
  personDetected: boolean
  visiblePoints: number
}

/** Called once per processed video frame with a canvas sized to the video. */
export type FrameHandler = (
  keypoints: Keypoint[] | null,
  ctx: CanvasRenderingContext2D,
  now: number,
  /** Person segmentation mask, only when segmentation is enabled on the detector. */
  mask: MaskView | null,
) => void

const STATS_INTERVAL_MS = 500

const EMPTY_STATS: TrackingStats = { fps: 0, inferenceMs: 0, personDetected: false, visiblePoints: 0 }

/**
 * Runs pose detection on every new video frame and hands the result to `onFrame`, which owns
 * drawing. Only HUD stats go through React state, twice a second.
 */
export function usePoseTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  detector: PoseDetector | null,
  onFrame: FrameHandler,
) {
  const [stats, setStats] = useState<TrackingStats>(EMPTY_STATS)
  // Read through a ref so a new handler doesn't restart the loop.
  const onFrameRef = useRef(onFrame)
  useEffect(() => {
    onFrameRef.current = onFrame
  }, [onFrame])

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!detector || !video || !canvas || !ctx) return

    let raf = 0
    let lastVideoTime = -1
    let lastTimestamp = 0
    let frames = 0
    let inferenceTotal = 0
    let windowStart = performance.now()

    const tick = () => {
      raf = requestAnimationFrame(tick)
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
      if (video.currentTime === lastVideoTime) return
      lastVideoTime = video.currentTime

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
      }

      // MediaPipe requires strictly increasing timestamps in VIDEO mode.
      const timestamp = Math.max(performance.now(), lastTimestamp + 1)
      lastTimestamp = timestamp

      const start = performance.now()
      const result = detector.landmarker.detectForVideo(video, timestamp)
      inferenceTotal += performance.now() - start
      frames++

      const keypoints = result.landmarks[0] ?? null
      const mpMask = result.segmentationMasks?.[0]
      const mask = mpMask ? { data: mpMask.getAsFloat32Array(), width: mpMask.width, height: mpMask.height } : null
      onFrameRef.current(keypoints, ctx, timestamp, mask)
      // Masks hold GPU memory until closed.
      if (mpMask) result.close()

      const now = performance.now()
      if (now - windowStart >= STATS_INTERVAL_MS) {
        setStats({
          fps: (frames * 1000) / (now - windowStart),
          inferenceMs: inferenceTotal / frames,
          personDetected: keypoints !== null,
          visiblePoints: keypoints?.filter((p) => p.visibility >= VISIBILITY_THRESHOLD).length ?? 0,
        })
        frames = 0
        inferenceTotal = 0
        windowStart = now
      }
    }

    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      setStats(EMPTY_STATS)
    }
  }, [videoRef, canvasRef, detector])

  return { stats }
}
