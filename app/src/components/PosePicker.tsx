import type { PoseTemplate } from '../pose/template'
import { TemplateFigure } from './TemplateFigure'

interface Props {
  /** Poses in display order (best suggestions first). */
  templates: PoseTemplate[]
  /** Ids to mark as suggested for this person. */
  suggested: Set<string>
  selectedId: string | null
  onSelect: (template: PoseTemplate | null) => void
  onAddPhoto: () => void
}

/** Horizontal strip of poses to pick from while the camera is running. */
export function PosePicker({ templates, suggested, selectedId, onSelect, onAddPhoto }: Props) {
  return (
    <div className="pose-strip" role="listbox" aria-label="Pose">
      <button type="button" className="pose-chip" onClick={onAddPhoto}>
        <span className="pose-chip-none">+ Photo</span>
        <span className="pose-chip-name">From your photo</span>
      </button>
      <button
        type="button"
        role="option"
        aria-selected={selectedId === null}
        className={`pose-chip${selectedId === null ? ' active' : ''}`}
        onClick={() => onSelect(null)}
      >
        <span className="pose-chip-none">Free</span>
        <span className="pose-chip-name">No guide</span>
      </button>
      {templates.map((t) => (
        <button
          key={t.id}
          type="button"
          role="option"
          aria-selected={selectedId === t.id}
          className={`pose-chip${selectedId === t.id ? ' active' : ''}`}
          onClick={() => onSelect(t)}
        >
          {suggested.has(t.id) && <span className="for-you">For you</span>}
          <TemplateFigure template={t} />
          <span className="pose-chip-name">{t.name}</span>
        </button>
      ))}
    </div>
  )
}
