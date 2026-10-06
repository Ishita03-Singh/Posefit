import { useMemo, useState } from 'react'

import { loadShape } from '../pose/shape'
import { type PoseTemplate, type Shot, SHOT_LABELS } from '../pose/template'
import { templateStore, useAllTemplates } from '../pose/templateStore'
import { bodyTraits, recommend } from '../recommend/recommend'
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
  onDelete?: () => void
}

function PoseCard({ template: t, reasons, onDelete }: CardProps) {
  return (
    <li className="pose-card">
      <TemplateFigure template={t} />
      <div className="pose-card-body">
        <h3>{t.name}</h3>
        <span className="badge">{SHOT_LABELS[t.shot]}</span>
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
