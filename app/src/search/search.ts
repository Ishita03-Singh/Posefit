import type { PoseTemplate, Shot } from '../pose/template'
import { cosine, poseVector } from './poseVector'

/**
 * Pose search, offline-first (the app must work on a phone with no server):
 * - Online: the server does semantic text search (MiniLM embeddings) and pose-shape search
 *   over the shared pgvector catalogue, which can be far larger than what is on the phone.
 * - Offline / server down: the same pose-shape vectors are compared on the device, and text
 *   falls back to keyword matching.
 * The user's own photo poses never leave the device, so they are always searched locally.
 */

export interface SearchResult {
  template: PoseTemplate
  /** 0..1 similarity. */
  score: number
  source: 'catalogue' | 'device'
}

export interface SearchOutcome {
  results: SearchResult[]
  /** False when the server couldn't be reached and only on-device search ran. */
  online: boolean
}

export type SearchQuery = { text: string; shot?: Shot } | { keypoints: PoseTemplate['keypoints']; shot?: Shot }

const TIMEOUT_MS = 3000
const MIN_POSE_SIMILARITY = 0.6

const tokens = (s: string) => s.toLowerCase().match(/[a-z]+/g) ?? []

/** Crude stemming for the offline fallback: "sit" ~ "sitting", "step" ~ "steps" (4+ letters shared). */
const sameStem = (a: string, b: string) => {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  return short.length >= 4 && long.startsWith(short)
}

/** Offline text fallback: weighted keyword overlap with name, tags, shot and description. */
export function keywordSearch(query: string, templates: PoseTemplate[], k = 10): SearchResult[] {
  const q = new Set(tokens(query).filter((w) => w.length > 2))
  if (q.size === 0) return []
  return templates
    .map((template) => {
      const fields: [string, number][] = [
        [template.name, 3],
        [template.tags.join(' '), 2],
        [template.shot.replace('_', ' '), 2],
        [template.description, 1],
      ]
      let hit = 0
      for (const [text, weight] of fields) {
        const words = new Set(tokens(text))
        for (const w of q) if (words.has(w) || [...words].some((x) => sameStem(x, w))) hit += weight
      }
      return { template, score: Math.min(1, hit / (q.size * 4)), source: 'device' as const }
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

export function poseSearch(keypoints: PoseTemplate['keypoints'], templates: PoseTemplate[], k = 10): SearchResult[] {
  const q = poseVector(keypoints)
  return templates
    .map((template) => ({ template, score: cosine(q, poseVector(template.keypoints)), source: 'device' as const }))
    .filter((r) => r.score >= MIN_POSE_SIMILARITY)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
}

async function remote(query: SearchQuery, k: number): Promise<SearchResult[] | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res =
      'text' in query
        ? await fetch(`/api/search?${new URLSearchParams({ q: query.text, k: String(k), ...(query.shot ? { shot: query.shot } : {}) })}`, {
            signal: ctrl.signal,
          })
        : await fetch('/api/search/pose', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keypoints: query.keypoints, shot: query.shot, k }),
            signal: ctrl.signal,
          })
    if (!res.ok) return null
    const body = (await res.json()) as { results: { template: PoseTemplate; score: number }[] }
    return body.results.map((r) => ({ ...r, source: 'catalogue' as const }))
  } catch {
    return null // offline, timed out, or server not running
  } finally {
    clearTimeout(timer)
  }
}

export async function searchPoses(query: SearchQuery, templates: PoseTemplate[], k = 12): Promise<SearchOutcome> {
  const shotOk = (t: PoseTemplate) => !query.shot || t.shot === query.shot
  const local = (pool: PoseTemplate[]) =>
    'text' in query ? keywordSearch(query.text, pool.filter(shotOk), k) : poseSearch(query.keypoints, pool.filter(shotOk), k)

  const catalogue = await remote(query, k)
  if (catalogue === null) return { results: local(templates), online: false }

  // Online: server ranking for the catalogue, plus matches among the user's own (device-only) poses.
  const mine = local(templates.filter((t) => t.source.kind === 'photo'))
  const seen = new Set(catalogue.map((r) => r.template.id))
  const results = [...catalogue, ...mine.filter((r) => !seen.has(r.template.id))].sort((a, b) => b.score - a.score)
  return { results: results.slice(0, k), online: true }
}
