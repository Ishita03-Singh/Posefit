import { type PoseTemplate, TEMPLATES } from '../pose/template'
import { TemplateFigure } from './TemplateFigure'

interface Props {
  selectedId: string | null
  onSelect: (template: PoseTemplate | null) => void
}

/** Horizontal strip of poses to pick from while the camera is running. */
export function PosePicker({ selectedId, onSelect }: Props) {
  return (
    <div className="pose-strip" role="listbox" aria-label="Pose">
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
      {TEMPLATES.map((t) => (
        <button
          key={t.id}
          type="button"
          role="option"
          aria-selected={selectedId === t.id}
          className={`pose-chip${selectedId === t.id ? ' active' : ''}`}
          onClick={() => onSelect(t)}
        >
          <TemplateFigure template={t} />
          <span className="pose-chip-name">{t.name}</span>
        </button>
      ))}
    </div>
  )
}
