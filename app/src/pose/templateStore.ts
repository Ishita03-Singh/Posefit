import { useSyncExternalStore } from 'react'

import { type PoseTemplate, TEMPLATES } from './template'

/**
 * Poses the user added from their own photos. Only keypoint coordinates are stored
 * (localStorage, this device); the photo itself is never kept.
 */

const STORAGE_KEY = 'posefit.customTemplates.v1'

function read(): PoseTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? (JSON.parse(raw) as PoseTemplate[]) : []
    return Array.isArray(list) ? list.filter((t) => t?.schema_version === 1 && t.keypoints) : []
  } catch {
    return []
  }
}

let custom: PoseTemplate[] = read()
let all: PoseTemplate[] = [...custom, ...TEMPLATES]
const listeners = new Set<() => void>()

function commit(next: PoseTemplate[]) {
  custom = next
  all = [...custom, ...TEMPLATES]
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom))
  } catch {
    // Storage full or blocked: the pose still works until the page is closed.
  }
  listeners.forEach((l) => l())
}

export const templateStore = {
  addCustom(t: PoseTemplate) {
    commit([t, ...custom.filter((c) => c.id !== t.id)])
  },
  removeCustom(id: string) {
    commit(custom.filter((c) => c.id !== id))
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

/** Custom poses first, then the built-in library. Stable array identity between changes. */
export function useAllTemplates(): PoseTemplate[] {
  return useSyncExternalStore(templateStore.subscribe, () => all)
}
