/**
 * Phone orientation from the gravity vector (DeviceMotionEvent.accelerationIncludingGravity).
 *
 * Gravity is used instead of DeviceOrientationEvent angles because those hit gimbal lock exactly
 * where we need them: a phone held upright (beta ≈ 90°) makes gamma unreliable.
 */
export interface Tilt {
  /** Rotation in the screen plane, degrees; 0 = level horizon. */
  roll: number
  /**
   * Forward/back lean, degrees. Positive = screen faces up, i.e. the rear camera points down
   * (and the front camera points up).
   */
  pitch: number
}

const SMOOTHING = 0.2
const STALE_MS = 1000

type MotionPermission = { requestPermission?: () => Promise<'granted' | 'denied'> }

class TiltSensor {
  private value: Tilt | null = null
  private updatedAt = 0
  private listening = false

  /** Latest reading, or null when there's no sensor (laptops) or no recent data. */
  get current(): Tilt | null {
    return this.value && performance.now() - this.updatedAt < STALE_MS ? this.value : null
  }

  /** iOS only grants motion data after a permission prompt shown from a user tap. */
  async requestPermission(): Promise<void> {
    const motion = (typeof DeviceMotionEvent !== 'undefined' ? DeviceMotionEvent : undefined) as
      | MotionPermission
      | undefined
    try {
      await motion?.requestPermission?.()
    } catch {
      // Denied or not a user gesture: tilt hints are simply unavailable.
    }
  }

  start(): void {
    if (this.listening || typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return
    this.listening = true
    window.addEventListener('devicemotion', this.onMotion)
  }

  stop(): void {
    if (!this.listening) return
    this.listening = false
    window.removeEventListener('devicemotion', this.onMotion)
    this.value = null
  }

  private onMotion = (e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity
    if (!g || g.x === null || g.y === null || g.z === null) return
    const next = tiltFromGravity(g.x, g.y, g.z, screen.orientation?.angle ?? 0)
    if (!next) return
    const prev = this.value
    this.value = prev
      ? { roll: prev.roll + (next.roll - prev.roll) * SMOOTHING, pitch: prev.pitch + (next.pitch - prev.pitch) * SMOOTHING }
      : next
    this.updatedAt = performance.now()
  }
}

/**
 * Converts a device-frame "up" vector (x right, y toward the top of the phone, z out of the
 * screen) into roll/pitch for the current screen rotation. Exported for tests.
 */
export function tiltFromGravity(x: number, y: number, z: number, screenAngle: number): Tilt | null {
  const n = Math.hypot(x, y, z)
  if (n < 5) return null // shaking or free fall
  // Express the vector in screen coordinates (screen rotated by `screenAngle` degrees).
  const a = (screenAngle * Math.PI) / 180
  let sx = x * Math.cos(a) + y * Math.sin(a)
  let sy = -x * Math.sin(a) + y * Math.cos(a)
  let sz = z
  // Some browsers report gravity itself rather than the upward reaction; normalise to "up".
  // Only decided when clearly inverted, so noise around a flat phone can't flip the sign.
  if (sy < -0.5 * n) {
    sx = -sx
    sy = -sy
    sz = -sz
  }
  return {
    roll: (Math.atan2(sx, sy) * 180) / Math.PI,
    pitch: (Math.asin(Math.max(-1, Math.min(1, sz / n))) * 180) / Math.PI,
  }
}

export const tilt = new TiltSensor()
