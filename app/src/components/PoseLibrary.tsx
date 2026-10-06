import { useMemo, useState } from 'react'

import { loadShape } from '../pose/shape'
import { type PoseTemplate, type Shot, SHOT_LABELS } from '../pose/template'
import { templateStore, useAllTemplates } from '../pose/templateStore'
import { bodyTraits, recommend } from '../recommend/recommend'
import { type SearchOutcome, searchPoses } from '../search/search'
import { poseFromPhoto } from '../vision/photoPose'
import { ImportPose } from './ImportPose'
import { TemplateFigure } from './TemplateFigure'

interface Props {
  onBack: () => void
}

type Filter = Shot | 'all'

const FILTERS: Filter[] = ['all', 'full_body', 'half_body', 'selfie']

export function PoseLibrary({ onBack }: Props) {
  const templates = useAllTemplates()
  const [filter, setFilter] = useState<Filter>('all')
  const [importing, setImporting] = useState(false)
  // Read once per visit; the scan happens on the camera screen.
  const [shape] = useState(loadShape)
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState<{ label: string; photoUrl?: string; outcome: SearchOutcome | null; error?: string } | null>(null)

  async function runText(e: React.FormEvent) {
    e.preventDefault()
    const text = query.trim()
    if (!text) return
    setSearch({ label: `Results for “${text}”`, outcome: null })
    const outcome = await searchPoses({ text }, templates)
    setSearch({ label: `Results for “${text}”`, outcome })
  }

  async function runPhoto(file: File) {
    if (search?.photoUrl) URL.revokeObjectURL(search.photoUrl)
    const photoUrl = URL.createObjectURL(file)
    setSearch({ label: 'Poses like your photo', photoUrl, outcome: null })
    try {
      const pose = await poseFromPhoto(file, photoUrl)
      // Only the pose's keypoints are searched (and, online, sent); the photo stays here.
      const outcome = await searchPoses({ keypoints: pose.keypoints }, templates)
      setSearch({ label: 'Poses like your photo', photoUrl, outcome })
    } catch (err) {
      setSearch({ label: 'Poses like your photo', photoUrl, outcome: null, error: err instanceof Error ? err.message : String(err) })
    }
  }

  function clearSearch() {
    if (search?.photoUrl) URL.revokeObjectURL(search.photoUrl)
    setSearch(null)
    setQuery('')
  }

  const traits = useMemo(() => (shape ? bodyTraits(shape) : []), [shape])
  const forYou = useMemo(() => (shape ? recommend(templates, shape).slice(0, 4) : []), [templates, shape])
  const mine = templates.filter((t) => t.source.kind === 'photo')
  const visible = filter === 'all' ? templates : templates.filter((t) => t.shot === filter)

  return (
    <main className="shell library">
      <header className="library-header">
        <button type="button" className="link" onClick={onBack}>
          ← Back
        </button>
        <h1>Pose library</h1>
        <p>{templates.length} poses</p>
        <button type="button" className="secondary" onClick={() => setImporting(true)}>
          + Add pose from photo
        </button>
      </header>

      <form className="search-bar" role="search" onSubmit={runText}>
        <input
          type="search"
          value={query}
          placeholder="Search poses, e.g. candid at a café, sitting on stairs"
          aria-label="Search poses"
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" className="secondary">
          Search
        </button>
        <label className="secondary file-search">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void runPhoto(f)
              e.target.value = ''
            }}
          />
          Find poses like a photo
        </label>
      </form>

      {search && (
        <section className="library-section">
          <div className="results-header">
            {search.photoUrl && <img src={search.photoUrl} alt="Your photo" className="query-photo" />}
            <h2>{search.label}</h2>
            <button type="button" className="link" onClick={clearSearch}>
              Clear
            </button>
          </div>
          {search.error ? (
            <p className="sheet-error">{search.error}</p>
          ) : !search.outcome ? (
            <p className="fine-print">Searching…</p>
          ) : (
            <>
              {!search.outcome.online && (
                <p className="fine-print">Offline: searched the poses on this device (keyword match for text).</p>
              )}
              {search.outcome.results.length === 0 ? (
                <p className="callout">No matching poses yet.</p>
              ) : (
                <ul className="pose-grid">
                  {search.outcome.results.map((r) => (
                    <PoseCard key={r.template.id} template={r.template} score={r.score} />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}

      {!search && (
      <section className="library-section">
        <h2>For you</h2>
        {shape ? (
          <>
            <ul className="traits">
              {traits.map((t) => (
                <li key={t.id}>{t.text}</li>
              ))}
            </ul>
            <p className="fine-print">
              From your body scan: proportions only (relative widths and limb lengths). No height or weight is
              measured.
            </p>
            <ul className="pose-grid">
              {forYou.map((r) => (
                <PoseCard key={r.template.id} template={r.template} reasons={r.reasons.slice(0, 2)} />
              ))}
            </ul>
          </>
        ) : (
          <p className="callout">
            Do a quick body scan on the camera screen (Scan body) to get poses suggested for your proportions.
          </p>
        )}
      </section>
      )}

      {mine.length > 0 && (
        <section className="library-section">
          <h2>Your poses</h2>
          <ul className="pose-grid">
            {mine.map((t) => (
              <PoseCard key={t.id} template={t} onDelete={() => templateStore.removeCustom(t.id)} />
            ))}
          </ul>
        </section>
      )}

      <section className="library-section">
        <h2>All poses</h2>
        <div className="chips" role="tablist" aria-label="Shot type">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              className={`chip${filter === f ? ' active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : SHOT_LABELS[f]}
            </button>
          ))}
        </div>
        <ul className="pose-grid">
          {visible.map((t) => (
            <PoseCard key={t.id} template={t} />
          ))}
        </ul>
      </section>

      {importing && <ImportPose onClose={() => setImporting(false)} onSaved={() => setImporting(false)} />}
    </main>
  )
}

interface CardProps {
  template: PoseTemplate
  reasons?: string[]
  /** 0..1 search similarity. */
  score?: number
  onDelete?: () => void
}

function PoseCard({ template: t, reasons, score, onDelete }: CardProps) {
  return (
    <li className="pose-card">
      <TemplateFigure template={t} />
      <div className="pose-card-body">
        <h3>{t.name}</h3>
        <span className="badge">{SHOT_LABELS[t.shot]}</span>
        {score !== undefined && <span className="badge match">{Math.round(score * 100)}% match</span>}
        {reasons && reasons.length > 0 ? (
          <ul className="reasons">
            {reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        ) : (
          <p>{t.description}</p>
        )}
        <div className="tags">
          {t.tags.map((tag) => (
            <span key={tag}>#{tag}</span>
          ))}
        </div>
        {onDelete && (
          <button type="button" className="link danger" onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </li>
  )
}
