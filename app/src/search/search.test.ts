import { afterEach, describe, expect, it, vi } from 'vitest'

import { TEMPLATES } from '../pose/template'
import { keywordSearch, poseSearch, searchPoses } from './search'

const byId = (id: string) => TEMPLATES.find((t) => t.id === id)!

describe('on-device search (offline fallback)', () => {
  it('keyword search matches names, tags and shot', () => {
    expect(keywordSearch('sitting steps', TEMPLATES)[0].template.id).toBe('seated-steps')
    expect(keywordSearch('cafe', TEMPLATES)[0].template.id).toBe('chin-rest')
    expect(keywordSearch('selfie', TEMPLATES).every((r) => r.template.shot === 'selfie')).toBe(true)
    expect(keywordSearch('xyzzy', TEMPLATES)).toEqual([])
  })

  it('pose search finds the same pose first and drops dissimilar ones', () => {
    const results = poseSearch(byId('victory-arms-up').keypoints, TEMPLATES)
    expect(results[0].template.id).toBe('victory-arms-up')
    expect(results[0].score).toBeCloseTo(1)
    expect(results.every((r) => r.score >= 0.6)).toBe(true)
  })
})

describe('searchPoses', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('falls back to the device when the server is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    const out = await searchPoses({ text: 'sitting steps' }, TEMPLATES)
    expect(out.online).toBe(false)
    expect(out.results[0].template.id).toBe('seated-steps')
    expect(out.results[0].source).toBe('device')
  })

  it('uses the catalogue online and adds matching personal poses from the device', async () => {
    const catalogue = { results: [{ template: byId('chin-rest'), score: 0.71 }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(catalogue), { status: 200 })))
    const mine = { ...byId('chin-rest'), id: 'my-cafe-pose-abc12', name: 'My cafe pose', source: { kind: 'photo' as const, ref: 'pin.jpg' } }
    const out = await searchPoses({ text: 'cafe' }, [...TEMPLATES, mine])
    expect(out.online).toBe(true)
    expect(out.results.map((r) => r.template.id)).toEqual(expect.arrayContaining(['chin-rest', 'my-cafe-pose-abc12']))
    expect(out.results.find((r) => r.template.id === 'my-cafe-pose-abc12')!.source).toBe('device')
  })

  it('photo search sends only keypoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await searchPoses({ keypoints: byId('classic-hand-on-hip').keypoints }, TEMPLATES)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/search/pose')
    expect(Object.keys(JSON.parse(init.body))).toEqual(['keypoints', 'k'])
  })
})
