import { useEffect, useState } from 'react'

import { createPoseDetector, type ModelVariant, type PoseDetector } from './poseDetector'

export type DetectorState =
  | { status: 'loading' }
  | { status: 'ready'; detector: PoseDetector }
  | { status: 'error'; message: string }

type Loaded = { variant: ModelVariant } & (
  | { detector: PoseDetector; error?: never }
  | { error: string; detector?: never }
)

/** Loads (and on change/unmount closes) a pose detector for the given model variant. */
export function usePoseDetector(variant: ModelVariant): DetectorState {
  const [loaded, setLoaded] = useState<Loaded | null>(null)

  useEffect(() => {
    let cancelled = false
    let detector: PoseDetector | null = null

    createPoseDetector(variant)
      .then((d) => {
        if (cancelled) {
          d.landmarker.close()
          return
        }
        detector = d
        setLoaded({ variant, detector: d })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoaded({ variant, error: err instanceof Error ? err.message : String(err) })
        }
      })

    return () => {
      cancelled = true
      detector?.landmarker.close()
    }
  }, [variant])

  // A result for a previous variant means the new one is still loading.
  if (!loaded || loaded.variant !== variant) return { status: 'loading' }
  if (loaded.error !== undefined) return { status: 'error', message: loaded.error }
  return { status: 'ready', detector: loaded.detector }
}
