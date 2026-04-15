import { useEffect, useState, useCallback } from 'react'
import { PlayCircle, Loader2 } from 'lucide-react'
import { getPhaseStatuses, triggerPhase, resetPhase } from '../api/client'
import type { PhaseStatus, PhaseKey } from '../types'
import { PHASES } from '../types'
import PhaseCard from '../components/PhaseCard'
import LogViewer from '../components/LogViewer'

export default function Phases() {
  const [statuses, setStatuses] = useState<Record<string, PhaseStatus>>({})
  const [logPhase, setLogPhase] = useState<PhaseKey | null>(null)
  const [runningAll, setRunningAll] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const fetchStatuses = useCallback(async () => {
    try {
      const r = await getPhaseStatuses()
      setStatuses(r.data)
    } catch {}
  }, [])

  useEffect(() => {
    fetchStatuses()
    const id = setInterval(fetchStatuses, 2000)
    return () => clearInterval(id)
  }, [fetchStatuses])

  const handleRun = async (phase: string) => {
    try {
      await triggerPhase(phase)
      showToast(`Phase '${phase}' 已開始執行`)
      fetchStatuses()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '執行失敗'
      showToast(`錯誤：${msg}`)
    }
  }

  const handleReset = async (phase: string) => {
    try {
      await resetPhase(phase)
      fetchStatuses()
    } catch {}
  }

  const handleRunAll = async () => {
    setRunningAll(true)
    try {
      await triggerPhase('all')
      showToast('全流程已開始執行')
      fetchStatuses()
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? '執行失敗'
      showToast(`錯誤：${msg}`)
    } finally {
      setRunningAll(false)
    }
  }

  const hasAnyRunning = PHASES.some(p => statuses[p.key]?.status === 'running')

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">執行</h1>
          <p className="text-slate-400 mt-1 text-sm">觸發各 Phase 執行並即時查看 Log</p>
        </div>
        <button
          onClick={handleRunAll}
          disabled={hasAnyRunning || runningAll}
          className="flex items-center gap-2 px-5 py-2.5 bg-ocp-red hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium text-sm"
        >
          {runningAll || hasAnyRunning
            ? <Loader2 size={16} className="animate-spin" />
            : <PlayCircle size={16} />}
          執行全部
        </button>
      </div>

      {/* Phase cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-4">
        {PHASES.map((phase) => (
          <PhaseCard
            key={phase.key}
            info={phase}
            status={statuses[phase.key]}
            onRun={() => handleRun(phase.key)}
            onViewLog={() => setLogPhase(phase.key)}
            onReset={() => handleReset(phase.key)}
          />
        ))}
      </div>

      {/* Ansible command hint */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="text-slate-400 text-xs mb-2 font-medium uppercase tracking-wider">等效指令</div>
        <pre className="text-slate-300 text-xs font-mono overflow-x-auto">
{`# 全流程
ansible-navigator run site.yml -e @vars/site.yml

# 單 Phase
ansible-navigator run site.yml -e @vars/site.yml --tags prep
ansible-navigator run site.yml -e @vars/site.yml --tags install
ansible-navigator run site.yml -e @vars/site.yml --tags post
ansible-navigator run site.yml -e @vars/site.yml --tags operators`}
        </pre>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-800 border border-slate-600 text-white text-sm px-4 py-3 rounded-xl shadow-xl z-50 animate-fade-in">
          {toast}
        </div>
      )}

      {/* Log Viewer */}
      {logPhase && (
        <LogViewer
          phase={logPhase}
          phaseLabel={PHASES.find(p => p.key === logPhase)?.label ?? logPhase}
          onClose={() => setLogPhase(null)}
        />
      )}
    </div>
  )
}
