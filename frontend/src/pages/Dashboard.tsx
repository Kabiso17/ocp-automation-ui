import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Loader2, Clock, AlertTriangle } from 'lucide-react'
import { getPhaseStatuses, validateConfig } from '../api/client'
import type { PhaseStatus, ValidationResult } from '../types'
import { PHASES } from '../types'

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'running': return <Loader2 size={18} className="text-blue-400 animate-spin" />
    case 'success': return <CheckCircle size={18} className="text-green-400" />
    case 'failed':  return <XCircle size={18} className="text-red-400" />
    default:         return <Clock size={18} className="text-slate-500" />
  }
}

const statusLabel: Record<string, string> = {
  pending: '待執行',
  running: '執行中',
  success: '成功',
  failed: '失敗',
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '—'
  const s = new Date(start).getTime()
  const e = end ? new Date(end).getTime() : Date.now()
  const sec = Math.floor((e - s) / 1000)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  return `${min}m ${sec % 60}s`
}

export default function Dashboard() {
  const [statuses, setStatuses] = useState<Record<string, PhaseStatus>>({})
  const [validation, setValidation] = useState<ValidationResult | null>(null)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [s, v] = await Promise.all([getPhaseStatuses(), validateConfig()])
        setStatuses(s.data)
        setValidation(v.data)
      } catch {}
    }
    fetchAll()
    const id = setInterval(fetchAll, 3000)
    return () => clearInterval(id)
  }, [])

  const allSuccess = PHASES.every(p => statuses[p.key]?.status === 'success')
  const hasRunning = PHASES.some(p => statuses[p.key]?.status === 'running')
  const hasFailed  = PHASES.some(p => statuses[p.key]?.status === 'failed')

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-slate-400 mt-1">OpenShift 安裝自動化管理介面</p>
      </div>

      {/* Overall status */}
      <div className={`rounded-xl border p-5 flex items-center gap-4 ${
        allSuccess  ? 'border-green-700 bg-green-950' :
        hasFailed   ? 'border-red-700 bg-red-950' :
        hasRunning  ? 'border-blue-700 bg-blue-950' :
        'border-slate-700 bg-slate-800'
      }`}>
        {allSuccess  ? <CheckCircle size={28} className="text-green-400" /> :
         hasFailed   ? <XCircle size={28} className="text-red-400" /> :
         hasRunning  ? <Loader2 size={28} className="text-blue-400 animate-spin" /> :
                       <Clock size={28} className="text-slate-400" />}
        <div>
          <div className="text-white font-semibold">
            {allSuccess  ? '所有 Phase 已完成' :
             hasFailed   ? '有 Phase 執行失敗' :
             hasRunning  ? '正在執行中...' :
             '尚未開始'}
          </div>
          <div className="text-sm text-slate-400 mt-0.5">
            {PHASES.filter(p => statuses[p.key]?.status === 'success').length} / {PHASES.length} 個 Phase 完成
          </div>
        </div>
      </div>

      {/* Config validation warning */}
      {validation && !validation.valid && (
        <div className="rounded-xl border border-yellow-700 bg-yellow-950 p-4">
          <div className="flex items-center gap-2 text-yellow-400 font-semibold mb-2">
            <AlertTriangle size={16} />
            配置尚未填寫完整
          </div>
          <ul className="text-yellow-300 text-sm space-y-1 list-disc list-inside">
            {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Phase grid */}
      <div>
        <h2 className="text-slate-300 text-sm font-semibold uppercase tracking-wider mb-4">安裝 Phases</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {PHASES.map((phase) => {
            const s = statuses[phase.key]
            const status = s?.status ?? 'pending'
            return (
              <div
                key={phase.key}
                className={`rounded-xl border p-4 space-y-3 ${
                  status === 'success' ? 'border-green-700 bg-green-950/40' :
                  status === 'failed'  ? 'border-red-700 bg-red-950/40' :
                  status === 'running' ? 'border-blue-700 bg-blue-950/40' :
                  'border-slate-700 bg-slate-800/40'
                }`}
              >
                <div className="flex items-center justify-between">
                  <StatusIcon status={status} />
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    status === 'success' ? 'bg-green-900 text-green-300' :
                    status === 'failed'  ? 'bg-red-900 text-red-300' :
                    status === 'running' ? 'bg-blue-900 text-blue-300' :
                    'bg-slate-700 text-slate-400'
                  }`}>
                    {statusLabel[status]}
                  </span>
                </div>
                <div>
                  <div className="text-white text-sm font-semibold">{phase.label}</div>
                  <div className="text-slate-400 text-xs mt-1">{phase.description}</div>
                </div>
                {s && (
                  <div className="text-xs text-slate-500 border-t border-slate-700 pt-2">
                    耗時: {formatDuration(s.started_at, s.finished_at)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
