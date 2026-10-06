export type Vec = [number, number]

export const add = (a: Vec, b: Vec): Vec => [a[0] + b[0], a[1] + b[1]]
export const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1]]
export const scale = (a: Vec, k: number): Vec => [a[0] * k, a[1] * k]
export const mid = (a: Vec, b: Vec): Vec => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
export const dist = (a: Vec, b: Vec): number => Math.hypot(a[0] - b[0], a[1] - b[1])
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Smallest absolute difference between two angles, in degrees (0..180). */
export function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Direction of b as seen from a, in degrees (image space: 0 = +x, 90 = +y/down). */
export const angleOf = (a: Vec, b: Vec): number => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI
