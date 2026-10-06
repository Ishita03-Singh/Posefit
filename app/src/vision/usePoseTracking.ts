import { type RefObject, useEffect, useRef, useState } from 'react'

import { drawSkeleton } from '../overlay/drawSkeleton'
import { type Keypoint, VISIBILITY_THRESHOLD } from '../pose/landmarks'
import type { PoseDetector } from './poseDetector'

export interface TrackingStats {
  fps: number
  inferenceMs: number
  personDetected: boolean
  visiblePoints: number
}

const STATS_INTERVAL_MS = 500

const EMPTY_STATS: TrackingStats = { fps: 0, inferenceMs: 0, personDetected: false, visiblePoints: 0 }

/**
 * Runs pose detection on every new video frame and draws the skeleton on `canvasRef`.
 * The latest keypoints are kept in a ref (not state) so later phases can read them per frame
 * without re-rendering React; only the HUD stats are pushed to state, twice a second.
 */
export function usePoseTracking(
  videoRef: RefObject<HTMLVideoElement | null>,
  canvasRef: RefObject<HTMLCanvasElement | null>,
  detector: PoseDetector | null,
) {
  const poseRef = useRef<Keypoint[] | null>(null)
  const [stats, setStats] = useState<TrackingStats>(EMPTY_STATS)

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
      poseRef.current = keypoints

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (keypoints) drawSkeleton(ctx, keypoints)

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
      poseRef.current = null
      setStats(EMPTY_STATS)
    }
  }, [videoRef, canvasRef, detector])

  return { poseRef, stats }
}
