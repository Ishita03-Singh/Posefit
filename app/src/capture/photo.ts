/** Grabs the current video frame at full camera resolution: the JPEG plus the canvas it came from. */
export function grabFrame(video: HTMLVideoElement, mirrored: boolean): Promise<{ blob: Blob; canvas: HTMLCanvasElement }> {
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('2D canvas not available'))
  // Selfies are saved as seen on screen (mirrored), like most camera apps' default.
  if (mirrored) {
    ctx.translate(canvas.width, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(video, 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve({ blob, canvas }) : reject(new Error('encoding failed'))), 'image/jpeg', 0.92),
  )
}
