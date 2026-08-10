import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { isSupabaseConfigured } from './lib/supabase'
import { deleteSkill, fetchSkills, fetchVacancies, updateSkill } from './lib/db'
import { AI } from './lib/settings'
import { useT } from './i18n'
import Header from './components/Header'
import ImportPanel from './components/ImportPanel'
import SkillsView from './components/SkillsView'
import VacanciesView from './components/VacanciesView'
import ReportView from './components/ReportView'
import ChatView from './components/ChatView'
import Setup from './components/Setup'
import AuthGate from './components/AuthGate'
import { Toasts } from './components/ui'

export default function App() {
  if (!isSupabaseConfigured) return <Setup />
  return (
    <AuthGate>
      <Dossier />
    </AuthGate>
  )
}

function Dossier() {
  const t = useT()
  const [tab, setTab] = useState('skills')
  const [skills, setSkills] = useState([])
  const [vacancies, setVacancies] = useState([])
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState([])
  const toastSeq = useRef(0)

  const toast = useCallback((message, kind = 'info') => {
    const id = ++toastSeq.current
    setToasts((prev) => [...prev, { id, message, kind }])
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), kind === 'error' ? 9000 : 4500)
  }, [])

  const dismissToast = useCallback((id) => setToasts((prev) => prev.filter((x) => x.id !== id)), [])

  const reload = useCallback(async () => {
    try {
      const [s, v] = await Promise.all([fetchSkills(), fetchVacancies()])
      setSkills(s)
      setVacancies(v)
    } catch (e) {
      toast(
        e.message.includes('does not exist') || e.message.includes('schema') ? t('errors.noTables') : e.message,
        'error',
      )
    }
  }, [toast, t])

  useEffect(() => {
    reload().finally(() => setLoading(false))
  }, [reload])

  // Оптимистичное обновление: интерфейс реагирует мгновенно, база догоняет.
  const patchSkill = useCallback(
    async (id, patch) => {
      const before = skills
      setSkills((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
      try {
        await updateSkill(id, patch)
      } catch (e) {
        setSkills(before)
        toast(e.message, 'error')
      }
    },
    [skills, toast],
  )

  const removeSkill = useCallback(
    async (skill) => {
      const before = skills
      setSkills((prev) => prev.filter((s) => s.id !== skill.id))
      try {
        await deleteSkill(skill.id)
        setVacancies(await fetchVacancies())
        toast(t('skills.deleted', { name: skill.name }), 'success')
      } catch (e) {
        setSkills(before)
        toast(e.message, 'error')
      }
    },
    [skills, toast, t],
  )

  const counts = useMemo(
    () => ({ skills: skills.length, vacancies: vacancies.length, import: 0, chat: 0, report: 0 }),
    [skills.length, vacancies.length],
  )

  const shared = { skills, vacancies, settings: AI, toast, onSaved: reload }

  return (
    <>
      <Header tab={tab} onTab={setTab} counts={counts} />

      <main className="shell">
        {loading ? (
          <div style={{ display: 'grid', gap: 12, paddingTop: 30 }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        ) : (
          <>
            {tab === 'import' && <ImportPanel {...shared} goToSkills={() => setTab('skills')} />}
            {tab === 'skills' && (
              <SkillsView
                {...shared}
                onPatch={patchSkill}
                onDelete={removeSkill}
                goToImport={() => setTab('import')}
              />
            )}
            {tab === 'report' && <ReportView {...shared} goToImport={() => setTab('import')} />}
            {tab === 'vacancies' && <VacanciesView {...shared} goToImport={() => setTab('import')} />}
            {tab === 'chat' && <ChatView {...shared} />}
          </>
        )}
      </main>

      <Toasts items={toasts} onDismiss={dismissToast} dismissLabel={t('common.cancel')} />
    </>
  )
}
