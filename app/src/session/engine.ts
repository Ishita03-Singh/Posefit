import { ARMED, type CapturePhase, type CaptureState, OFF, secondsLeft, step } from '../capture/autoCapture'
import { HintStabilizer, Voice } from '../coach/coach'
import { composition } from '../coach/composition'
import { type Cue, cueSpeech, cueText, type ShootingMode } from '../coach/cues'
import { anchorPoints, flipTemplate, placeGhost, retarget } from '../match/fit'
import { type MatchResult, matchPose } from '../match/match'
import { drawBody } from '../overlay/drawBody'
import { drawSkeleton } from '../overlay/drawSkeleton'
import { type Anchor, anchorFor, type BodyPoints, toPixels } from '../pose/body'
import type { Keypoint } from '../pose/landmarks'
import { BodyProfile } from '../pose/profile'
import { type BodyShape, loadShape, type MaskView, measure, saveShape, ShapeScanner } from '../pose/shape'
import { type PoseTemplate, SCAN_TEMPLATE } from '../pose/template'
import { tilt } from '../sensors/tilt'

// How fast the drawn ghost follows the person (0..1 per frame); lower is smoother.
const FOLLOW = 0.3
const UI_INTERVAL_MS = 100

export interface SessionSnapshot {
  /** Main line shown (and spoken) to the user. */
  message: string
  score: number | null
  phase: CapturePhase
  countdown: number | null
  matched: boolean
  /** 0..1 while the body scan is running, else null. */
  scanProgress: number | null
  /** Whether a measured body shape is in use (vs average proportions). */
  hasShape: boolean
  /** Phone roll in degrees for the level indicator; null without a motion sensor. */
  roll: number | null
}

export interface SessionOptions {
  showSkeleton: boolean
  /** Do the pose on the other side. */
  flipPose: boolean
  /** Alone (self) or someone else holding the phone (friend). */
  mode: ShootingMode
  facing: 'user' | 'environment'
}

/**
 * Per-frame pose session: fits the chosen template to the person, scores the match, coaches,
 * and drives hands-free capture. A body-scan mode measures the person's shape from the
 * segmentation mask so the ghost is drawn as their own silhouette.
 *
 * Lives outside React so the 30fps loop never re-renders the UI; React gets a throttled
 * snapshot via `onSnapshot`.
 */
export class SessionEngine {
  readonly voice = new Voice()
  readonly profile = new BodyProfile()
  options: SessionOptions = { showSkeleton: false, flipPose: false, mode: 'self', facing: 'user' }

  onSnapshot: (s: SessionSnapshot) => void = () => {}
  /** Called when a photo should be taken now. */
  onShoot: () => void = () => {}

  private template: PoseTemplate | null = null
  private capture: CaptureState = OFF
  private autoEnabled = true
  private matched = false
  private hints = new HintStabilizer<Cue>()
  private lastCountdown: number | null = null
  private lastSnapshotAt = 0
  private lastPhase: CapturePhase = 'off'
  private drawAnchor: Anchor | null = null

  private shape: BodyShape | null = loadShape()
  private scanning = false
  private scanner = new ShapeScanner()

  constructor() {
    if (this.shape) this.profile.seed(this.shape.lengths)
  }

  /** True while the detector should output segmentation masks. */
  get wantsMask(): boolean {
    return this.scanning
  }

  get hasShape(): boolean {
    return this.shape !== null
  }

  setTemplate(template: PoseTemplate | null): void {
    this.template = template
    this.hints.reset()
    this.matched = false
    this.capture = template && this.autoEnabled && !this.scanning ? ARMED : OFF
  }

  setOptions(options: SessionOptions): void {
    this.options = options
  }

  setVoice(enabled: boolean): void {
    this.voice.enabled = enabled
    if (!enabled) this.voice.stop()
  }

  setHandlers(handlers: { onShoot: () => void; onSnapshot: (s: SessionSnapshot) => void }): void {
    this.onShoot = handlers.onShoot
    this.onSnapshot = handlers.onSnapshot
  }

  setAuto(enabled: boolean): void {
    this.autoEnabled = enabled
    this.capture = enabled && this.template && !this.scanning ? ARMED : OFF
  }

  /** Re-arm after a finished burst. */
  rearm(): void {
    if (this.template && this.autoEnabled && !this.scanning) this.capture = ARMED
  }

  get phase(): CapturePhase {
    return this.capture.phase
  }

  startScan(): void {
    this.scanning = true
    this.scanner.reset()
    this.hints.reset()
    this.matched = false
    this.capture = OFF
    this.voice.now('Body scan. Stand straight, with your arms slightly away from your body.', performance.now())
  }

  stopScan(): void {
    this.scanning = false
    this.hints.reset()
    this.rearm()
  }

  frame(keypoints: Keypoint[] | null, ctx: CanvasRenderingContext2D, now: number, mask: MaskView | null = null): void {
    const { width, height } = ctx.canvas
    ctx.clearRect(0, 0, width, height)

    const user = keypoints ? toPixels(keypoints, width, height) : null
    if (user) this.profile.update(user)
    if (keypoints && this.options.showSkeleton) drawSkeleton(ctx, keypoints)

    if (this.scanning) {
      this.scanFrame(user, ctx, now, mask)
      return
    }

    const { mode, facing } = this.options
    const template = this.template
    if (!template) {
      // No pose guide: still coach the camera angle and framing.
      const comp = composition({
        user,
        anchor: user ? anchorFor(user, 'torso') : null,
        shot: null,
        width,
        height,
        tilt: tilt.current,
        facing,
      })
      const cue = this.hints.update(comp.cue, now)
      const message = cue ? cueText(cue, mode) : keypoints ? 'Pick a pose below' : 'Step into the frame'
      this.voice.say(cue ? cueSpeech(cue, mode) : null, now)
      this.emit(now, { message, score: null, matched: false })
      return
    }

    const t = this.options.flipPose ? flipTemplate(template) : template
    const result = this.ghost(t, user, ctx)
    const comp = composition({
      user,
      anchor: result.anchor,
      shot: t.shot,
      width,
      height,
      tilt: tilt.current,
      facing,
    })

    // Priority: get the person in frame, then fix a badly tilted phone, then the pose itself,
    // then softer photography tips.
    let next: Cue | null
    if (result.cue?.key.startsWith('frame:')) next = result.cue
    else if (comp.urgent) next = comp.cue
    else next = result.cue ?? comp.cue

    const stepped = step(this.capture, now, this.matched)
    this.capture = stepped.state
    if (stepped.shoot) this.onShoot()

    this.speakPhase(now)
    const cue = this.hints.update(next, now)
    const message = this.messageFor(cue ? cueText(cue, mode) : null, now)
    if (this.capture.phase === 'aiming' || this.capture.phase === 'off') {
      this.voice.say(cue ? cueSpeech(cue, mode) : message, now)
    }

    this.emit(now, { message, score: result.placement ? result.score : null, matched: this.matched })
  }

  /** Matches the person against a template and draws the ghost on them; updates `matched`. */
  private ghost(t: PoseTemplate, user: BodyPoints | null, ctx: CanvasRenderingContext2D): MatchResult {
    const { width, height } = ctx.canvas
    const ideal = placeGhost(t, retarget(t, this.profile), width, height)
    const result = matchPose(user, ideal, t)

    // The ghost is drawn on the person (their torso position and size), smoothed; with nobody
    // in view it rests at the ideal framing so they know where to stand.
    const target = result.anchor ?? ideal.anchor
    const a = this.drawAnchor
    this.drawAnchor = a
      ? {
          origin: [
            a.origin[0] + (target.origin[0] - a.origin[0]) * FOLLOW,
            a.origin[1] + (target.origin[1] - a.origin[1]) * FOLLOW,
          ],
          unit: a.unit + (target.unit - a.unit) * FOLLOW,
        }
      : target

    // Hysteresis: easier to stay matched than to become matched, so the state doesn't flicker.
    this.matched = this.matched ? result.holding : result.ready

    drawBody(ctx, anchorPoints(ideal.keypoints, this.drawAnchor), this.drawAnchor.unit, {
      boneScores: result.placement ? result.boneScores : null,
      matched: this.matched,
      shape: this.shape ?? undefined,
    })
    return result
  }

  private scanFrame(user: BodyPoints | null, ctx: CanvasRenderingContext2D, now: number, mask: MaskView | null): void {
    const result = this.ghost(SCAN_TEMPLATE, user, ctx)

    // Only measure while the person is clearly in the neutral pose: limbs apart from the torso.
    if (this.matched && mask && user) {
      const sample = measure(mask, user, ctx.canvas.width, ctx.canvas.height)
      if (sample) this.scanner.add(sample)
    }

    if (this.scanner.progress >= 1) {
      this.shape = this.scanner.result()
      saveShape(this.shape)
      this.profile.seed(this.shape.lengths)
      this.scanning = false
      this.hints.reset()
      this.voice.now('Body scan done. The ghost now has your shape.', now)
      this.rearm()
      this.emit(now, { message: 'Body scan done', score: null, matched: false }, true)
      return
    }

    const { mode } = this.options
    const cue = this.hints.update(result.cue, now)
    const pct = Math.round(this.scanner.progress * 100)
    const message = this.matched
      ? `Hold still… ${pct}%`
      : cue
        ? cueText(cue, mode)
        : 'Stand straight, arms slightly away from your body'
    if (!this.matched) this.voice.say(cue ? cueSpeech(cue, mode) : message, now)
    this.emit(now, { message, score: null, matched: this.matched })
  }

  private messageFor(hint: string | null, now: number): string {
    switch (this.capture.phase) {
      case 'holding':
        return 'Hold it…'
      case 'countdown':
        return String(secondsLeft(this.capture, now))
      case 'shooting':
        return 'Shooting…'
      case 'done':
        return 'Got it!'
      default:
        if (hint) return hint
        return this.matched ? 'Perfect' : 'Almost there, fine-tune the pose'
    }
  }

  /** Countdown numbers and "got it" are spoken immediately, not rate-limited. */
  private speakPhase(now: number): void {
    const n = secondsLeft(this.capture, now)
    if (n !== null && n !== this.lastCountdown) this.voice.now(String(n), now)
    this.lastCountdown = n
    const phase = this.capture.phase
    if (phase !== this.lastPhase) {
      if (phase === 'holding') this.voice.now('Hold it', now)
      if (phase === 'done') this.voice.now('Got it!', now)
      this.lastPhase = phase
    }
  }

  private emit(
    now: number,
    s: Pick<SessionSnapshot, 'message' | 'score' | 'matched'>,
    force = false,
  ): void {
    if (!force && now - this.lastSnapshotAt < UI_INTERVAL_MS) return
    this.lastSnapshotAt = now
    this.onSnapshot({
      ...s,
      phase: this.capture.phase,
      countdown: secondsLeft(this.capture, now),
      scanProgress: this.scanning ? this.scanner.progress : null,
      hasShape: this.shape !== null,
      roll: tilt.current?.roll ?? null,
    })
  }
}
