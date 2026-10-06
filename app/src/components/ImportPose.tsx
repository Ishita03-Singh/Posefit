import { useEffect, useRef, useState } from 'react'

import { type PoseTemplate, type Shot, SHOT_LABELS } from '../pose/template'
import { templateStore } from '../pose/templateStore'
import { photoDetector, poseFromPhoto } from '../vision/photoPose'
import { TemplateFigure } from './TemplateFigure'

interface Props {
  onClose: () => void
  onSaved: (template: PoseTemplate) => void
}

/**
 * Turns a photo (e.g. a Pinterest screenshot) into a pose template, entirely on the device.
 * The photo is only held in memory while this dialog is open; only the pose is saved.
 */
export function ImportPose({ onClose, onSaved }: Props) {
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [draft, setDraft] = useState<PoseTemplate | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [shot, setShot] = useState<Shot>('full_body')
  const urlRef = useRef<string | null>(null)

  useEffect(() => {
    let cancelled = false
    photoDetector()
      .then(() => !cancelled && setReady(true))
      .catch((e: unknown) => !cancelled && setLoadError(e instanceof Error ? e.message : String(e)))
    return () => {
      cancelled = true
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [])

  async function onFile(file: File) {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    const url = URL.createObjectURL(file)
    urlRef.current = url
    setPhotoUrl(url)
    setDraft(null)
    setError(null)
    setBusy(true)
    try {
      const t = await poseFromPhoto(file, url)
      setDraft(t)
      setName(t.name)
      setShot(t.shot)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  function save() {
    if (!draft) return
    const t: PoseTemplate = { ...draft, name: name.trim() || draft.name, shot }
    templateStore.addCustom(t)
    onSaved(t)
  }

  return (
    <div className="sheet" role="dialog" aria-label="Add a pose from a photo">
      <header className="sheet-header">
        <h2>Add a pose from a photo</h2>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
      </header>

      <p className="sheet-note">
        Pick a photo with one person in the pose you like, such as a Pinterest screenshot. It is analysed on this
        device and not saved: only the pose shape is kept.
      </p>

      {loadError ? (
        <p className="sheet-error">Couldn't load the pose model: {loadError}</p>
      ) : (
        <label className={`file-pick${!ready ? ' disabled' : ''}`}>
          <input
            type="file"
            accept="image/*"
            disabled={!ready}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
              e.target.value = ''
            }}
          />
          {ready ? (photoUrl ? 'Choose another photo' : 'Choose a photo') : 'Loading pose model…'}
        </label>
      )}

      {photoUrl && (
        <div className="import-preview">
          <img src={photoUrl} alt="Your reference photo" />
          <div className="import-figure">
            {busy && <p>Finding the pose…</p>}
            {error && <p className="sheet-error">{error}</p>}
            {draft && <TemplateFigure template={{ ...draft, shot }} />}
          </div>
        </div>
      )}

      {draft && (
        <form
          className="import-form"
          onSubmit={(e) => {
            e.preventDefault()
            save()
          }}
        >
          <label>
            Name
            <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Shot
            <select value={shot} onChange={(e) => setShot(e.target.value as Shot)}>
              {(Object.keys(SHOT_LABELS) as Shot[]).map((s) => (
                <option key={s} value={s}>
                  {SHOT_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary-action">
            Save pose
          </button>
        </form>
      )}
    </div>
  )
}
