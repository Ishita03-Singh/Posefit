import { useState } from 'react'

import { type Shot, SHOT_LABELS, TEMPLATES } from '../pose/template'
import { TemplateFigure } from './TemplateFigure'

interface Props {
  onBack: () => void
}

type Filter = Shot | 'all'

const FILTERS: Filter[] = ['all', 'full_body', 'half_body', 'selfie']

export function PoseLibrary({ onBack }: Props) {
  const [filter, setFilter] = useState<Filter>('all')
  const visible = filter === 'all' ? TEMPLATES : TEMPLATES.filter((t) => t.shot === filter)

  return (
    <main className="shell library">
      <header className="library-header">
        <button type="button" className="link" onClick={onBack}>
          ← Back
        </button>
        <h1>Pose library</h1>
        <p>{TEMPLATES.length} poses</p>
      </header>

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
          <li key={t.id} className="pose-card">
            <TemplateFigure template={t} />
            <div className="pose-card-body">
              <h2>{t.name}</h2>
              <span className="badge">{SHOT_LABELS[t.shot]}</span>
              <p>{t.description}</p>
              <div className="tags">
                {t.tags.map((tag) => (
                  <span key={tag}>#{tag}</span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </main>
  )
}
