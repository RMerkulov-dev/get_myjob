import { useMemo, useState } from 'react'
import { CATEGORY_IDS } from '../lib/constants'
import { createSkillManually } from '../lib/db'
import { useI18n } from '../i18n'
import Stats from './Stats'
import SkillCard from './SkillCard'
import LessonModal from './LessonModal'
import { Empty, Icon, PageHead, Segmented } from './ui'

const STATUSES = ['all', 'todo', 'progress', 'learned']
const POSITION_FILTERS = ['all', 'PM', 'BA']
const SORTS = ['priority', 'mentions', 'level', 'name', 'recent']

export default function SkillsView({ skills, vacancies, settings, onPatch, onDelete, onSaved, toast, goToImport }) {
  const { t, locale } = useI18n()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('all')
  const [position, setPosition] = useState('all')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('priority')
  const [grouped, setGrouped] = useState(true)
  const [newName, setNewName] = useState('')
  const [lessonSkill, setLessonSkill] = useState(null)

  const statusOptions = useMemo(() => STATUSES.map((id) => ({ id, label: t(`skills.status.${id}`) })), [t])
  const positionOptions = useMemo(
    () => POSITION_FILTERS.map((id) => ({ id, label: id === 'all' ? t('skills.position.all') : id })),
    [t],
  )

  const usedCategories = useMemo(() => {
    const set = new Set(skills.map((s) => s.category))
    return CATEGORY_IDS.filter((id) => set.has(id))
  }, [skills])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = skills.filter((s) => {
      if (q) {
        const haystack = [s.name, s.description ?? '', s.notes ?? '', ...(s.aliases ?? [])].join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (status === 'learned' && !s.learned) return false
      if (status === 'todo' && (s.learned || (s.level ?? 0) > 1)) return false
      if (status === 'progress' && (s.learned || (s.level ?? 0) < 2)) return false
      if (position !== 'all' && !(s.positions ?? []).includes(position)) return false
      if (category !== 'all' && s.category !== category) return false
      return true
    })

    const weight = (s) =>
      (s.importance === 'must' ? 2 : 0) + (s.mentions ?? 0) * 0.5 - (s.level ?? 0) * 0.6 - (s.learned ? 5 : 0)
    const byName = (a, b) => a.name.localeCompare(b.name, locale)

    return [...list].sort((a, b) => {
      switch (sort) {
        case 'mentions':
          return (b.mentions ?? 0) - (a.mentions ?? 0) || byName(a, b)
        case 'level':
          return (a.level ?? 0) - (b.level ?? 0) || byName(a, b)
        case 'name':
          return byName(a, b)
        case 'recent':
          return new Date(b.created_at) - new Date(a.created_at)
        default:
          return weight(b) - weight(a) || byName(a, b)
      }
    })
  }, [skills, query, status, position, category, sort, locale])

  const groups = useMemo(() => {
    if (!grouped) return [{ id: 'all', label: null, items: filtered }]
    const map = new Map()
    for (const s of filtered) {
      if (!map.has(s.category)) map.set(s.category, [])
      map.get(s.category).push(s)
    }
    return CATEGORY_IDS.filter((id) => map.has(id)).map((id) => ({
      id,
      label: t(`categories.${id}`),
      items: map.get(id),
    }))
  }, [filtered, grouped, t])

  async function handleAdd(e) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    try {
      await createSkillManually({ name, positions: position === 'all' ? ['PM'] : [position] })
      setNewName('')
      await onSaved()
      toast(t('skills.added', { name }), 'success')
    } catch (err) {
      toast(err.message.includes('duplicate') ? t('skills.duplicate') : err.message, 'error')
    }
  }

  if (!skills.length) {
    return (
      <>
        <PageHead title={t('skills.title')} accent={t('skills.titleAccent')}>
          {t('skills.emptyLead')}
        </PageHead>
        <Empty
          title={t('skills.emptyTitle')}
          action={
            <button className="btn btn-accent" onClick={goToImport}>
              <Icon name="plus" /> {t('skills.emptyCta')}
            </button>
          }
        >
          {t('skills.emptyText')}
        </Empty>
      </>
    )
  }

  return (
    <>
      <PageHead
        title={t('skills.title')}
        accent={t('skills.titleAccent')}
        aside={
          <div className="mono" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
            {t('skills.shown', { shown: filtered.length, total: skills.length })}
          </div>
        }
      >
        {t('skills.lead')}
      </PageHead>

      <Stats skills={skills} vacancies={vacancies} />

      {/* ------------------------------------------------------- фильтры */}
      <div className="card" style={{ marginBottom: 22, padding: 16 }}>
        <div className="row wrap" style={{ gap: 12 }}>
          <div className="search">
            <span className="search-icon"><Icon name="search" size={14} /></span>
            <input
              className="input"
              placeholder={t('skills.searchPlaceholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Segmented options={statusOptions} value={status} onChange={setStatus} />
          <Segmented options={positionOptions} value={position} onChange={setPosition} accent />
        </div>

        <div className="row wrap" style={{ gap: 12, marginTop: 12 }}>
          <select className="select" style={{ width: 'auto' }} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">{t('skills.allCategories')}</option>
            {usedCategories.map((id) => (
              <option key={id} value={id}>{t(`categories.${id}`)}</option>
            ))}
          </select>
          <select className="select" style={{ width: 'auto' }} value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map((id) => (
              <option key={id} value={id}>{t(`skills.sort.${id}`)}</option>
            ))}
          </select>
          <label className="check ink">
            <input type="checkbox" checked={grouped} onChange={(e) => setGrouped(e.target.checked)} />
            <span>{t('skills.group')}</span>
          </label>
          <span className="spacer" />
          <form className="row" style={{ gap: 6 }} onSubmit={handleAdd}>
            <input
              className="input input-mono"
              style={{ width: 190 }}
              placeholder={t('skills.addManual')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button className="btn btn-sm" type="submit" disabled={!newName.trim()}>
              <Icon name="plus" size={13} />
            </button>
          </form>
        </div>
      </div>

      {/* ------------------------------------------------------- список */}
      {filtered.length === 0 ? (
        <Empty title={t('skills.notFound')}>{t('skills.notFoundText')}</Empty>
      ) : (
        groups.map((g) => (
          <section className="group" key={g.id}>
            {g.label && (
              <div className="group-head">
                <h2 className="group-title">{g.label}</h2>
                <span className="mono">{g.items.length}</span>
                <span className="group-rule" />
                <span className="mono">
                  {t('skills.learnedCount', { n: g.items.filter((s) => s.learned).length })}
                </span>
              </div>
            )}
            <div className="skill-grid">
              {g.items.map((s, i) => (
                <SkillCard key={s.id} skill={s} index={i} onPatch={onPatch} onDelete={onDelete} onLearn={setLessonSkill} />
              ))}
            </div>
          </section>
        ))
      )}

      {lessonSkill && (
        <LessonModal
          skill={skills.find((s) => s.id === lessonSkill.id) ?? lessonSkill}
          settings={settings}
          onPatch={onPatch}
          toast={toast}
          onClose={() => setLessonSkill(null)}
        />
      )}
    </>
  )
}
