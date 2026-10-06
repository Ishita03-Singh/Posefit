import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'

import { type Facing, useCamera } from '../camera/useCamera'
import { grabFrame } from '../capture/photo'
import type { ShootingMode } from '../coach/cues'
import { type PoseTemplate, TEMPLATES } from '../pose/template'
import { tilt } from '../sensors/tilt'
import { SessionEngine, type SessionSnapshot } from '../session/engine'
import type { ModelVariant } from '../vision/poseDetector'
import { usePoseDetector } from '../vision/usePoseDetector'
import { type FrameHandler, usePoseTracking } from '../vision/usePoseTracking'
import { PosePicker } from './PosePicker'
import { type Photo, ReviewSheet } from './ReviewSheet'

interface Props {
  onExit: () => void
}

const MAX_PHOTOS = 30
const DEFAULT_TEMPLATE = TEMPLATES.find((t) => t.id === 'classic-hand-on-hip') ?? TEMPLATES[0] ?? null

const INITIAL_SNAPSHOT: SessionSnapshot = {
  message: 'Starting…',
  score: null,
  phase: 'off',
  countdown: null,
  matched: false,
  scanProgress: null,
  hasShape: false,
  roll: null,
}

export function CameraView({ onExit }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [engine] = useState(() => new SessionEngine())

  const [facing, setFacing] = useState<Facing>('user')
  const [variant, setVariant] = useState<ModelVariant>('lite')
  const [template, setTemplate] = useState<PoseTemplate | null>(DEFAULT_TEMPLATE)
  const [flipPose, setFlipPose] = useState(false)
  const [auto, setAuto] = useState(true)
  const [voiceOn, setVoiceOn] = useState(true)
  const [ringLight, setRingLight] = useState(false)
  const [showSkeleton, setShowSkeleton] = useState(false)
  const [posesOpen, setPosesOpen] = useState(false)
  const [friendMode, setFriendMode] = useState(true)
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(INITIAL_SNAPSHOT)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)
  const [flash, setFlash] = useState(false)

  const camera = useCamera(videoRef, true, facing)
  const detectorState = usePoseDetector(variant)
  const detector = detectorState.status === 'ready' ? detectorState.detector : null
  const mirrored = facing === 'user'
  // With the rear camera someone else usually holds the phone; the selfie camera means you're alone.
  const mode: ShootingMode = !mirrored && friendMode ? 'friend' : 'self'

  // --- engine wiring -------------------------------------------------------

  useEffect(() => engine.setTemplate(template), [engine, template])
  useEffect(() => engine.setAuto(auto), [engine, auto])
  useEffect(
    () => engine.setOptions({ showSkeleton, flipPose, mode, facing }),
    [engine, showSkeleton, flipPose, mode, facing],
  )
  useEffect(() => {
    tilt.start()
    return () => tilt.stop()
  }, [])
  useEffect(() => engine.setVoice(voiceOn), [engine, voiceOn])

  // First time on this device: scan the body so the ghost takes the person's own shape.
  const autoScanned = useRef(false)
  useEffect(() => {
    if (camera.status !== 'ready' || !detector || engine.hasShape || autoScanned.current) return
    autoScanned.current = true
    engine.startScan()
  }, [engine, camera.status, detector])

  // Segmentation masks cost GPU readback every frame, so they are only on during the scan.
  const scanning = snapshot.scanProgress !== null
  useEffect(() => {
    void detector?.landmarker.setOptions({ outputSegmentationMasks: scanning })
  }, [detector, scanning])

  const takePhoto = useCallback(async () => {
    const video = videoRef.current
    if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return
    setFlash(true)
    setTimeout(() => setFlash(false), 120)
    const blob = await grabFrame(video, mirrored)
    const id = new Date().toISOString().replace(/[:.]/g, '-')
    const photo: Photo = { id, url: URL.createObjectURL(blob), blob }
    setPhotos((prev) => {
      const next = [...prev, photo]
      next.slice(0, Math.max(0, next.length - MAX_PHOTOS)).forEach((p) => URL.revokeObjectURL(p.url))
      return next.slice(-MAX_PHOTOS)
    })
  }, [mirrored])

  useEffect(() => {
    let lastPhase = engine.phase
    engine.setHandlers({
      onShoot: () => void takePhoto(),
      onSnapshot: (s) => {
        setSnapshot(s)
        if (s.phase === 'done' && lastPhase !== 'done') setReviewOpen(true)
        lastPhase = s.phase
      },
    })
  }, [engine, takePhoto])

  // Revoke photo URLs and silence speech when leaving the camera.
  const photosRef = useRef(photos)
  useEffect(() => {
    photosRef.current = photos
  }, [photos])
  useEffect(
    () => () => {
      engine.voice.stop()
      photosRef.current.forEach((p) => URL.revokeObjectURL(p.url))
    },
    [engine],
  )

  const onFrame = useCallback<FrameHandler>((kp, ctx, now, mask) => engine.frame(kp, ctx, now, mask), [engine])
  const { stats } = usePoseTracking(videoRef, canvasRef, camera.status === 'ready' ? detector : null, onFrame)

  // --- status line ---------------------------------------------------------

  let message: string
  if (camera.status === 'error') message = camera.message
  else if (detectorState.status === 'error') message = `Model failed to load: ${detectorState.message}`
  else if (camera.status !== 'ready') message = 'Starting camera…'
  else if (detectorState.status === 'loading') message = 'Loading pose model…'
  else message = snapshot.message

  // Keep the frame clear while the person holds the pose.
  const capturing =
    scanning || snapshot.phase === 'holding' || snapshot.phase === 'countdown' || snapshot.phase === 'shooting'

  const shootAgain = () => {
    setReviewOpen(false)
    setAuto(true)
    engine.rearm()
  }

  return (
    <div className={`camera${ringLight && mirrored ? ' ring-light' : ''}`}>
      <div
        className={`stage${mirrored ? ' mirrored' : ''}`}
        onClick={() => template && !scanning && setAuto((a) => !a)}
        aria-label={auto ? 'Tap to pause auto capture' : 'Tap to resume auto capture'}
      >
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />
      </div>
      {flash && <div className="flash" />}

      <div className="hud">
        <div className="hud-row">
          <button type="button" onClick={onExit}>
            Close
          </button>
          {snapshot.roll !== null && <Level roll={snapshot.roll} />}
          {snapshot.score !== null && template ? (
            <span className={`score${snapshot.matched ? ' matched' : ''}`}>{Math.round(snapshot.score)}%</span>
          ) : (
            <span />
          )}
        </div>
        <p className={`message${snapshot.matched ? ' matched' : ''}`} aria-live="polite">
          {snapshot.countdown === null ? message : ''}
        </p>
        {mode === 'friend' && <p className="sub">Friend mode: directions are for the person holding the phone</p>}
        {template && !auto && <p className="sub">Auto capture paused · tap to resume</p>}
        {detector && camera.status === 'ready' && (
          <p className="metrics">
            {stats.fps.toFixed(0)} fps · {stats.inferenceMs.toFixed(1)} ms · {detector.delegate} {detector.variant}
          </p>
        )}
      </div>

      {snapshot.countdown !== null && <div className="countdown">{snapshot.countdown}</div>}

      <div className={`bottom${capturing ? ' capturing' : ''}`}>
        {scanning && (
          <div className="scan-bar">
            <span>Body scan</span>
            <div className="scan-progress" aria-label="Scan progress">
              <span style={{ width: `${Math.round((snapshot.scanProgress ?? 0) * 100)}%` }} />
            </div>
            <button type="button" onClick={() => engine.stopScan()}>
              Skip
            </button>
          </div>
        )}
        {posesOpen ? (
          <PosePicker
            selectedId={template?.id ?? null}
            onSelect={(t) => {
              setTemplate(t)
              setPosesOpen(false)
            }}
          />
        ) : (
          <button type="button" className="pose-current" onClick={() => setPosesOpen(true)}>
            {template ? `Pose: ${template.name}` : 'No pose guide'} · Change
          </button>
        )}

        <div className="toggles">
          <Toggle on={auto} onClick={() => setAuto((a) => !a)} disabled={!template}>
            Auto
          </Toggle>
          <Toggle on={voiceOn} onClick={() => setVoiceOn((v) => !v)}>
            Voice
          </Toggle>
          <Toggle on={snapshot.hasShape} onClick={() => engine.startScan()}>
            {snapshot.hasShape ? 'Rescan body' : 'Scan body'}
          </Toggle>
          <Toggle on={flipPose} onClick={() => setFlipPose((f) => !f)} disabled={!template}>
            Other side
          </Toggle>
          {!mirrored && (
            <Toggle on={friendMode} onClick={() => setFriendMode((f) => !f)}>
              Friend shooting
            </Toggle>
          )}
          {mirrored && (
            <Toggle on={ringLight} onClick={() => setRingLight((r) => !r)}>
              Ring light
            </Toggle>
          )}
          <Toggle on={showSkeleton} onClick={() => setShowSkeleton((s) => !s)}>
            Skeleton
          </Toggle>
          <Toggle on={variant === 'full'} onClick={() => setVariant((v) => (v === 'lite' ? 'full' : 'lite'))}>
            Accurate model
          </Toggle>
        </div>

        <div className="shutter-row">
          <button
            type="button"
            className="tray"
            onClick={() => setReviewOpen(true)}
            aria-label={`Your photos (${photos.length})`}
          >
            {photos.length > 0 ? <img src={photos[photos.length - 1].url} alt="" /> : <span>0</span>}
          </button>
          <button type="button" className="shutter" onClick={() => void takePhoto()} aria-label="Take photo" />
          <button type="button" onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}>
            Flip
          </button>
        </div>
      </div>

      {reviewOpen && (
        <ReviewSheet
          photos={photos}
          onShootAgain={shootAgain}
          onClose={() => setReviewOpen(false)}
          onClear={() => {
            photos.forEach((p) => URL.revokeObjectURL(p.url))
            setPhotos([])
          }}
        />
      )}
    </div>
  )
}

interface ToggleProps {
  on: boolean
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}

function Toggle({ on, onClick, disabled, children }: ToggleProps) {
  return (
    <button type="button" className={`toggle${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )
}

/** Spirit level: the line stays parallel to the real horizon; green when the phone is level. */
function Level({ roll }: { roll: number }) {
  const level = Math.abs(roll) < 2
  return (
    <span className={`level${level ? ' ok' : ''}`} role="img" aria-label={level ? 'Phone is level' : 'Phone is tilted'}>
      <span style={{ transform: `rotate(${roll}deg)` }} />
    </span>
  )
}
