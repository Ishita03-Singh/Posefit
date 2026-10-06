export interface Photo {
  id: string
  url: string
  blob: Blob
}

interface Props {
  photos: Photo[]
  onShootAgain: () => void
  onClose: () => void
  onClear: () => void
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

export function ReviewSheet({ photos, onShootAgain, onClose, onClear }: Props) {
  const canShare = typeof navigator !== 'undefined' && 'canShare' in navigator
  return (
    <div className="review" role="dialog" aria-label="Your photos">
      <header className="review-header">
        <h2>Your photos</h2>
        <button type="button" onClick={onClose}>
          Back to camera
        </button>
      </header>
      {photos.length === 0 ? (
        <p className="review-empty">No photos yet.</p>
      ) : (
        <ul className="review-grid">
          {[...photos].reverse().map((p) => (
            <li key={p.id}>
              <img src={p.url} alt="" />
              <div className="review-actions">
                <a href={p.url} download={fileName(p)}>
                  Save
                </a>
                {canShare && (
                  <button type="button" onClick={() => share(p)}>
                    Share
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
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
