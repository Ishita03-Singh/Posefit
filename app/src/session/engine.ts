import { ARMED, type CapturePhase, type CaptureState, OFF, secondsLeft, step } from '../capture/autoCapture'
import { HintStabilizer, Voice } from '../coach/coach'
import { flipTemplate, placeGhost, retarget } from '../match/fit'
import { LOOSE, matchPose, placementWithin, TIGHT } from '../match/match'
import { drawGhost } from '../overlay/drawGhost'
import { drawSkeleton } from '../overlay/drawSkeleton'
import { toPixels } from '../pose/body'
import type { Keypoint } from '../pose/landmarks'
import { BodyProfile } from '../pose/profile'
import type { PoseTemplate } from '../pose/template'

const ENTER_SCORE = 80
const STAY_SCORE = 70
const UI_INTERVAL_MS = 100

export interface SessionSnapshot {
  /** Main line shown (and spoken) to the user. */
  message: string
  score: number | null
  phase: CapturePhase
  countdown: number | null
  matched: boolean
}

export interface SessionOptions {
  showSkeleton: boolean
  /** Do the pose on the other side. */
  flipPose: boolean
}

/**
 * Per-frame pose session: fits the chosen template to the person, scores the match, coaches,
 * and drives hands-free capture. Lives outside React so the 30fps loop never re-renders the UI;
 * React gets a throttled snapshot via `onSnapshot`.
 */
export class SessionEngine {
  readonly voice = new Voice()
  readonly profile = new BodyProfile()
  options: SessionOptions = { showSkeleton: false, flipPose: false }

  onSnapshot: (s: SessionSnapshot) => void = () => {}
  /** Called when a photo should be taken now. */
  onShoot: () => void = () => {}

  private template: PoseTemplate | null = null
  private capture: CaptureState = OFF
  private autoEnabled = true
  private matched = false
  private hints = new HintStabilizer()
  private lastCountdown: number | null = null
  private lastSnapshotAt = 0
  private lastPhase: CapturePhase = 'off'

  setTemplate(template: PoseTemplate | null): void {
    this.template = template
    this.hints.reset()
    this.matched = false
    this.capture = template && this.autoEnabled ? ARMED : OFF
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
    this.capture = enabled && this.template ? ARMED : OFF
  }

  /** Re-arm after a finished burst. */
  rearm(): void {
    if (this.template && this.autoEnabled) this.capture = ARMED
  }

  get phase(): CapturePhase {
    return this.capture.phase
  }

  frame(keypoints: Keypoint[] | null, ctx: CanvasRenderingContext2D, now: number): void {
    const { width, height } = ctx.canvas
    ctx.clearRect(0, 0, width, height)

    const user = keypoints ? toPixels(keypoints, width, height) : null
    if (user) this.profile.update(user)
    if (keypoints && this.options.showSkeleton) drawSkeleton(ctx, keypoints)

    const template = this.template
    if (!template) {
      this.emit(now, { message: keypoints ? 'Pick a pose below' : 'Step into the frame', score: null, matched: false })
      return
    }

    const t = this.options.flipPose ? flipTemplate(template) : template
    const ghost = placeGhost(t, retarget(t, this.profile), width, height)
    const result = matchPose(user, ghost, t)
    drawGhost(ctx, ghost, result.placement ? result.boneScores : null, t.key_joints)

    // Hysteresis: easier to stay matched than to become matched, so the state doesn't flicker.
    const p = result.placement
    this.matched = this.matched
      ? p !== null && placementWithin(p, LOOSE) && result.score >= STAY_SCORE
      : p !== null && placementWithin(p, TIGHT) && result.score >= ENTER_SCORE && result.hint === null

    const stepped = step(this.capture, now, this.matched)
    this.capture = stepped.state
    if (stepped.shoot) this.onShoot()

    this.speakPhase(now)
    const hint = this.hints.update(result.hint, now)
    const message = this.messageFor(hint, now)
    if (this.capture.phase === 'aiming' || this.capture.phase === 'off') this.voice.say(message, now)

    this.emit(now, { message, score: p ? result.score : null, matched: this.matched })
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

  private emit(now: number, s: Omit<SessionSnapshot, 'phase' | 'countdown'>): void {
    if (now - this.lastSnapshotAt < UI_INTERVAL_MS) return
    this.lastSnapshotAt = now
    this.onSnapshot({ ...s, phase: this.capture.phase, countdown: secondsLeft(this.capture, now) })
  }
}
