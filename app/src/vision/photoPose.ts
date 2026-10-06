import { templateFromPhoto } from '../pose/fromPhoto'
import { type PoseTemplate, SCAN_TEMPLATE } from '../pose/template'
import { createPoseDetector, type PoseDetector } from './poseDetector'

let detector: Promise<PoseDetector> | null = null

/** Shared still-image pose detector ("full" model: accuracy over speed), created on first use. */
export function photoDetector(): Promise<PoseDetector> {
  detector ??= createPoseDetector('full', 'IMAGE').catch((err: unknown) => {
    detector = null // allow a retry
    throw err
  })
  return detector
}

const nameFromFile = (file: string) =>
  file
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40) || 'My pose'

/** Finds the pose in a photo, on the device, and returns it as an (unsaved) template. */
export async function poseFromPhoto(file: File, url: string): Promise<PoseTemplate> {
  const { landmarker } = await photoDetector()
  const img = new Image()
  img.src = url
  await img.decode()
  const landmarks = landmarker.detect(img).landmarks[0]
  if (!landmarks) throw new Error('No person found in this photo. Try one with a single, clearly visible person.')
  return templateFromPhoto({
    landmarks,
    width: img.naturalWidth,
    height: img.naturalHeight,
    name: nameFromFile(file.name),
    ref: file.name,
    neutral: SCAN_TEMPLATE,
  })
}
