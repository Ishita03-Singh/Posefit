// Pose template format v1. Source of truth: tools/posefit_tools/template.py
// (JSON Schema: shared/pose-template.schema.json).

import type { LandmarkName } from './landmarks'

export type Shot = 'full_body' | 'half_body' | 'selfie'
export type Point2 = [number, number]

export interface PoseTemplate {
  schema_version: 1
  id: string
  name: string
  description: string
  shot: Shot
  tags: string[]
  /** "torso": origin mid-hip, unit torso length. "head": origin mid-shoulder (no hips visible). */
  frame: 'torso' | 'head'
  /** Body-relative coordinates, x right / y down, person's left on image right. */
  keypoints: Partial<Record<LandmarkName, Point2>>
  key_joints: LandmarkName[]
  source: { kind: 'generated' | 'photo'; ref: string | null }
}

export const SHOT_LABELS: Record<Shot, string> = {
  full_body: 'Full body',
  half_body: 'Half body',
  selfie: 'Selfie',
}

// Bundled at build time; adding a JSON file to shared/templates/ adds a pose to the app.
const modules = import.meta.glob<PoseTemplate>('../../../shared/templates/*.json', {
  eager: true,
  import: 'default',
})

export const TEMPLATES: PoseTemplate[] = Object.values(modules)
  .filter((t) => t.schema_version === 1)
  .sort((a, b) => a.name.localeCompare(b.name))
