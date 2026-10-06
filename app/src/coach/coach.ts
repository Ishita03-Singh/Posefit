/**
 * Turns per-frame hints into calm guidance: a hint must persist briefly before it is shown
 * (no flicker between two instructions), and speech is rate-limited.
 */
export class HintStabilizer<T extends { key: string }> {
  private candidate: string | null = null
  private candidateSince = 0
  current: T | null = null

  private readonly settleMs: number

  constructor(settleMs = 450) {
    this.settleMs = settleMs
  }

  /** Hints are compared by `key`, since an equal hint is usually a new object every frame. */
  update(hint: T | null, now: number): T | null {
    const key = hint?.key ?? null
    if (key !== this.candidate) {
      this.candidate = key
      this.candidateSince = now
    }
    if (key !== (this.current?.key ?? null) && now - this.candidateSince >= this.settleMs) this.current = hint
    // Same key: keep the latest object (its wording may depend on the shooting mode).
    else if (key !== null && key === this.current?.key) this.current = hint
    return this.current
  }

  reset(): void {
    this.candidate = null
    this.current = null
  }
}

/** Spoken coaching via the browser's built-in speech synthesis (works offline on most phones). */
export class Voice {
  enabled = true
  private lastSpoken = ''
  private lastAt = 0

  private readonly minGapMs: number

  constructor(minGapMs = 2200) {
    this.minGapMs = minGapMs
  }

  get supported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window
  }

  /** Speaks a coaching line if it changed and enough time has passed. */
  say(text: string | null, now: number): void {
    if (!text || !this.enabled || !this.supported) return
    if (text === this.lastSpoken && now - this.lastAt < 6000) return
    if (now - this.lastAt < this.minGapMs) return
    this.speak(text, now)
  }

  /** Speaks immediately, interrupting anything queued (countdown numbers, "got it"). */
  now(text: string, now: number): void {
    if (!this.enabled || !this.supported) return
    window.speechSynthesis.cancel()
    this.speak(text, now)
  }

  stop(): void {
    if (this.supported) window.speechSynthesis.cancel()
  }

  private speak(text: string, now: number): void {
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 1.05
    window.speechSynthesis.speak(u)
    this.lastSpoken = text
    this.lastAt = now
  }
}
