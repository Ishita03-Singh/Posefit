/**
 * A coaching instruction phrased for both ways of shooting:
 * - self: the person is alone (selfie, or phone propped up) and hears/reads it themselves.
 * - friend: someone else holds the phone; the screen talks to the photographer.
 */
export interface Cue {
  /** Stable identity, so the same instruction isn't treated as new when re-created. */
  key: string
  self: string
  friend: string
  /** Who has to act: the person being photographed, or whoever holds the camera. */
  who: 'subject' | 'camera'
}

export type ShootingMode = 'self' | 'friend'

const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)

/** "Raise your left hand" -> "Ask them to raise their left hand". */
export function toThirdPerson(text: string): string {
  return `Ask them to ${lowerFirst(text).replace(/\byour\b/g, 'their').replace(/\byou\b/g, 'them')}`
}

/** Something the person being photographed must do. */
export function subjectCue(key: string, self: string): Cue {
  return { key, self, friend: toThirdPerson(self), who: 'subject' }
}

/** Something about the camera: framing, distance, angle. */
export function cameraCue(key: string, self: string, friend: string): Cue {
  return { key, self, friend, who: 'camera' }
}

export function cueText(cue: Cue, mode: ShootingMode): string {
  return mode === 'friend' ? cue.friend : cue.self
}

/**
 * What to say out loud. In friend mode the photographer reads the screen, so only
 * instructions for the subject are spoken (in their own words: "raise your left hand").
 */
export function cueSpeech(cue: Cue, mode: ShootingMode): string | null {
  if (mode === 'self') return cue.self
  return cue.who === 'subject' ? cue.self : null
}
