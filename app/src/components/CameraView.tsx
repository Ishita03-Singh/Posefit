import { useRef, useState } from 'react'

import { type Facing, useCamera } from '../camera/useCamera'
import type { ModelVariant } from '../vision/poseDetector'
import { usePoseDetector } from '../vision/usePoseDetector'
import { usePoseTracking } from '../vision/usePoseTracking'

interface Props {
  onExit: () => void
}

export function CameraView({ onExit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [facing, setFacing] = useState<Facing>('user')
  const [variant, setVariant] = useState<ModelVariant>('lite')

  const camera = useCamera(videoRef, true, facing)
  const detectorState = usePoseDetector(variant)
  const detector = detectorState.status === 'ready' ? detectorState.detector : null
  const { stats } = usePoseTracking(videoRef, canvasRef, camera.status === 'ready' ? detector : null)

  let status: string
  if (camera.status === 'error') status = camera.message
  else if (detectorState.status === 'error') status = `Model failed to load: ${detectorState.message}`
  else if (camera.status !== 'ready') status = 'Starting camera…'
  else if (detectorState.status === 'loading') status = 'Loading pose model…'
  else if (!stats.personDetected) status = 'Step into the frame'
  else status = `Tracking ${stats.visiblePoints}/33 points`

  return (
    <div className="camera">
      <div className={`stage${facing === 'user' ? ' mirrored' : ''}`}>
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />
      </div>

      <div className="hud">
        <span className="status">{status}</span>
        {detector && camera.status === 'ready' && (
          <span className="metrics">
            {stats.fps.toFixed(0)} fps · {stats.inferenceMs.toFixed(1)} ms · {detector.delegate}{' '}
            {detector.variant}
          </span>
        )}
      </div>

      <div className="controls">
        <button type="button" onClick={onExit}>
          Close
        </button>
        <button type="button" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
          Flip camera
        </button>
        <button type="button" onClick={() => setVariant((v) => (v === 'lite' ? 'full' : 'lite'))}>
          Model: {variant}
        </button>
      </div>
    </div>
  )
}
