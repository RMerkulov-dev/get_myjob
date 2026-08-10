import { useState } from 'react'
import { useT } from '../i18n'
import { Icon, LevelPicker } from './ui'

export default function SkillCard({ skill, index, onPatch, onDelete, onLearn }) {
  const t = useT()
  const [notesOpen, setNotesOpen] = useState(false)
  const [notes, setNotes] = useState(skill.notes ?? '')

  return (
    <article
      className="skill"
      data-learned={skill.learned}
      data-must={skill.importance === 'must'}
      style={{ animationDelay: `${Math.min(index, 20) * 0.022}s` }}
    >
      <div className="skill-head">
        <h3 className="skill-name" style={{ flex: 1 }}>{skill.name}</h3>
        <div className="skill-actions">
          <button
            className="icon-btn icon-btn-learn"
            title={t('lesson.open')}
            aria-label={t('lesson.open')}
            onClick={() => onLearn(skill)}
          >
            <Icon name="cap" size={15} />
          </button>
          <button
            className="icon-btn"
            title={t('skills.note')}
            onClick={() => setNotesOpen((v) => !v)}
            style={notesOpen || skill.notes ? { color: 'var(--ink)' } : undefined}
          >
            <Icon name="doc" size={13} />
          </button>
          <button
            className="icon-btn"
            title={t('skills.deleteTitle')}
            onClick={() => {
              if (confirm(t('skills.deleteConfirm', { name: skill.name }))) onDelete(skill)
            }}
          >
            <Icon name="trash" size={13} />
          </button>
        </div>
      </div>

      <div className="skill-meta">
        <span className="tag">{t(`categories.${skill.category}`)}</span>
        {skill.importance === 'must' && <span className="tag tag-must">{t('common.must')}</span>}
        {(skill.positions ?? []).map((p) => (
          <span key={p} className="tag">{p}</span>
        ))}
        {skill.mentions > 1 && <span className="tag tag-warn">{t('skills.mentions', { n: skill.mentions })}</span>}
        {skill.learned && <span className="tag tag-learned">{t('common.learned').toLowerCase()}</span>}
      </div>

      {skill.description && <p className="skill-desc">{skill.description}</p>}

      {notesOpen && (
        <div>
          <textarea
            className="input"
            style={{ fontSize: 13, minHeight: 76, resize: 'vertical' }}
            placeholder={t('skills.notePlaceholder')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => {
              if (notes !== (skill.notes ?? '')) onPatch(skill.id, { notes: notes || null })
            }}
          />
          <div className="mono" style={{ marginTop: 5, fontSize: 10 }}>{t('skills.noteHint')}</div>
        </div>
      )}

      <div className="skill-foot">
        <LevelPicker
          value={skill.level ?? 0}
          learned={skill.learned}
          onChange={(level) => onPatch(skill.id, { level })}
        />
        <label className="check" style={{ marginLeft: 'auto' }} title={t('common.learned')}>
          <input
            type="checkbox"
            checked={skill.learned}
            onChange={(e) => onPatch(skill.id, { learned: e.target.checked })}
          />
          <span className="mono" style={{ color: skill.learned ? 'var(--green)' : undefined }}>
            {t('common.learned')}
          </span>
        </label>
      </div>
    </article>
  )
}
