import { type RefObject, useEffect, useState } from 'react'

export type Facing = 'user' | 'environment'

export type CameraState =
  | { status: 'off' }
  | { status: 'starting' }
  | { status: 'ready'; width: number; height: number }
  | { status: 'error'; message: string }

function describeError(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Camera permission was denied.'
    if (err.name === 'NotFoundError') return 'No camera found on this device.'
    if (err.name === 'NotReadableError') return 'The camera is in use by another app.'
  }
  if (!window.isSecureContext) return 'Camera needs HTTPS. Open the https:// dev URL.'
  return err instanceof Error ? err.message : String(err)
}

/** Streams the selected camera into `videoRef` while `enabled`; stops all tracks on change/unmount. */
export function useCamera(
  videoRef: RefObject<HTMLVideoElement | null>,
  enabled: boolean,
  facing: Facing,
): CameraState {
  const [state, setState] = useState<CameraState>({ status: 'off' })

  useEffect(() => {
    const video = videoRef.current
    if (!enabled || !video) {
      setState({ status: 'off' })
      return
    }

    let stream: MediaStream | null = null
    let cancelled = false
    setState({ status: 'starting' })

    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      })
      .then(async (s) => {
        stream = s
        if (cancelled) return
        video.srcObject = s
        await video.play()
        if (cancelled) return
        setState({ status: 'ready', width: video.videoWidth, height: video.videoHeight })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ status: 'error', message: describeError(err) })
      })

    return () => {
      cancelled = true
      stream?.getTracks().forEach((t) => t.stop())
      video.srcObject = null
    }
  }, [videoRef, enabled, facing])

  return state
}
