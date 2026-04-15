import { CheckCircle, XCircle, Loader2, Clock, RotateCcw, Play, FileText } from 'lucide-react'
import type { PhaseStatus, PhaseInfo } from '../types'

interface PhaseCardProps {
  info: PhaseInfo
  status: PhaseStatus | undefined
  onRun: () => void
  onViewLog: () => void
  onReset: () => void
}

const statusConfig = {
  pending: { icon: Clock, color: 'text-slate-400', bg: 'bg-slate-800', label: '待執行', badge: 'bg-slate-700 text-slate-300' },
  running: { icon: Loader2, color: 'text-blue-400', bg: 'bg-blue-950', label: '執行中', badge: 'bg-blue-900 text-blue-300' },
  success: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-950', label: '成功', badge: 'bg-green-900 text-green-300' },
  failed:  { icon: XCircle, color: 'text-red-400', bg: 'bg-red-950', label: '失敗', badge: 'bg-red-900 text-red-300' },
}

function formatTime(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW', { hour12: false })
}

export default function PhaseCard({ info, status, onRun, onViewLog, onReset }: PhaseCardProps) {
  const s = status?.status ?? 'pending'
  const cfg = statusConfig[s] || statusConfig.pending
  const Icon = cfg.icon
  const isRunning = s === 'running'

  return (
    <div className={`rounded-xl border border-slate-700 ${cfg.bg} p-5 flex flex-col gap-4`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Icon
            size={22}
            className={`${cfg.color} ${isRunning ? 'animate-spin' : ''} shrink-0`}
          />
          <div>
            <div className="text-white font-semibold text-sm">{info.label}</div>
            <div className="text-slate-400 text-xs mt-0.5">{info.description}</div>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium shrink-0 ${cfg.badge}`}>
          {cfg.label}
        </span>
      </div>

      {/* Timing */}
      {status && (s === 'running' || s === 'success' || s === 'failed') && (
        <div className="text-xs text-slate-500 space-y-0.5 border-t border-slate-700 pt-3">
          <div>開始：{formatTime(status.started_at)}</div>
          {status.finished_at && <div>結束：{formatTime(status.finished_at)}</div>}
          {status.log_lines > 0 && <div>Log 行數：{status.log_lines.toLocaleString()}</div>}
          {status.exit_code !== null && <div>Exit Code：{status.exit_code}</div>}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={onRun}
          disabled={isRunning}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-ocp-red hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs rounded-lg transition-colors font-medium"
        >
          <Play size={12} />
          執行
        </button>
        <button
          onClick={onViewLog}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs rounded-lg transition-colors"
        >
          <FileText size={12} />
          查看 Log
        </button>
        {(s === 'success' || s === 'failed') && (
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs rounded-lg transition-colors"
          >
            <RotateCcw size={12} />
            重置
          </button>
        )}
      </div>
    </div>
  )
}
