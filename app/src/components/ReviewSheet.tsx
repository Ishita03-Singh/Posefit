import { useMemo } from 'react'

import { type Note, rankBurst, type ShotSignals } from '../bestshot/metrics'

export interface Photo {
  id: string
  url: string
  blob: Blob
  /** Photos from one auto-capture burst share this; each manual photo has its own. */
  burstId: string
  /** Best Shots measurements; undefined while still being analysed. */
  signals?: ShotSignals
}

interface Props {
  photos: Photo[]
  onShootAgain: () => void
  onClose: () => void
  onClear: () => void
  /** Removes these photos (e.g. everything but the best of a burst). */
  onRemove: (ids: string[]) => void
}

interface Ranked {
  photo: Photo
  total: number | null
  notes: Note[]
}

interface Burst {
  id: string
  photos: Ranked[]
  analysing: boolean
}

const fileName = (p: Photo) => `posefit-${p.id}.jpg`

async function share(p: Photo) {
  const file = new File([p.blob], fileName(p), { type: 'image/jpeg' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
    } catch {
      // User dismissed the share sheet.
    }
  }
}

/** Groups photos by burst (newest first) and ranks each burst once every photo is analysed. */
function groupBursts(photos: Photo[]): Burst[] {
  const order: string[] = []
  const byBurst = new Map<string, Photo[]>()
  for (const p of [...photos].reverse()) {
    if (!byBurst.has(p.burstId)) {
      byBurst.set(p.burstId, [])
      order.push(p.burstId)
    }
    byBurst.get(p.burstId)!.push(p)
  }
  return order.map((id) => {
    const list = byBurst.get(id)!
    const analysing = list.some((p) => !p.signals)
    if (analysing) return { id, analysing, photos: list.map((photo) => ({ photo, total: null, notes: [] })) }
    const scores = rankBurst(list.map((p) => p.signals!))
    const ranked = list.map((photo, i) => ({ photo, total: scores[i].total, notes: scores[i].notes }))
    ranked.sort((a, b) => b.total! - a.total!)
    return { id, analysing, photos: ranked }
  })
}

export function ReviewSheet({ photos, onShootAgain, onClose, onClear, onRemove }: Props) {
  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator
  const bursts = useMemo(() => groupBursts(photos), [photos])

  return (
    <div className="review" role="dialog" aria-label="Your photos">
      <header className="review-header">
        <h2>Your photos</h2>
        <button type="button" onClick={onClose}>
          Back to camera
        </button>
      </header>

      {bursts.length === 0 && <p className="review-empty">No photos yet.</p>}

      {bursts.map((burst) => {
        const multi = burst.photos.length > 1
        return (
          <section key={burst.id} className="burst">
            {multi && (
              <div className="burst-header">
                <span>{burst.analysing ? 'Finding your best shot…' : `Best of ${burst.photos.length}`}</span>
                {!burst.analysing && (
                  <button type="button" onClick={() => onRemove(burst.photos.slice(1).map((r) => r.photo.id))}>
                    Keep only the best
                  </button>
                )}
              </div>
            )}
            <ul className="review-grid">
              {burst.photos.map(({ photo, notes }, i) => (
                <li key={photo.id} className={multi && !burst.analysing && i === 0 ? 'best' : undefined}>
                  <div className="review-photo">
                    <img src={photo.url} alt="" />
                    {multi && !burst.analysing && i === 0 && <span className="best-badge">Best shot</span>}
                  </div>
                  {notes.length > 0 && (
                    <ul className="shot-notes">
                      {notes.map((n) => (
                        <li key={n.text} className={n.tone}>
                          {n.text}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="review-actions">
                    <a href={photo.url} download={fileName(photo)}>
                      Save
                    </a>
                    {canShare && (
                      <button type="button" onClick={() => share(photo)}>
                        Share
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}

      <footer className="review-footer">
        <button type="button" className="shoot-again" onClick={onShootAgain}>
          Shoot again
        </button>
        {photos.length > 0 && (
          <button type="button" onClick={onClear}>
            Clear all
          </button>
        )}
      </footer>
    </div>
  )
}
