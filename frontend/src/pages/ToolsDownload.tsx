/**
 * ToolsDownload.tsx
 * ------------------------------------------------------------------
 * CLI 工具下載頁面
 *
 * 功能：
 * 1. 顯示 oc、oc-mirror、openshift-install 的安裝狀態與版本
 * 2. 選擇 OCP 版本後點擊「下載安裝」自動從 Red Hat mirror 下載
 * 3. 即時串流下載 log
 * ------------------------------------------------------------------
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Terminal, Download, CheckCircle2, XCircle, RefreshCw,
  AlertCircle, ArrowDown, Package, FolderOpen, ExternalLink,
  RotateCcw, Clock,
} from 'lucide-react'
import {
  getToolsStatus, startToolDownload,
  resetToolsDownload, getConfig,
} from '../api/client'
import type { ToolStatus, DownloadState } from '../types'

// OCP 版本清單（最新在前）
const OCP_VERSIONS = [
  '4.20.8', '4.20.5', '4.20.0',
  '4.19.15', '4.19.10', '4.19.5', '4.19.0',
  '4.18.20', '4.18.15', '4.18.10',
  '4.17.30', '4.17.25',
  '4.16.40', '4.16.35',
]

// ── 狀態徽章 ────────────────────────────────────────────────────────

function InstalledBadge({ installed, version }: { installed: boolean; version: string | null }) {
  if (installed && version) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-900/40 text-green-300 border border-green-700">
        <CheckCircle2 size={11} /> 已安裝
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-slate-700 text-slate-400">
      <XCircle size={11} /> 未安裝
    </span>
  )
}

// ── 工具卡片 ────────────────────────────────────────────────────────

function ToolCard({
  toolKey,
  info,
  isDownloading,
  onDownload,
}: {
  toolKey: string
  info: ToolStatus
  isDownloading: boolean
  onDownload: (key: string) => void
}) {
  const canDownload = info.available && !isDownloading

  return (
    <div className={`bg-slate-800 rounded-xl border p-5 transition-colors ${
      isDownloading ? 'border-blue-600' : 'border-slate-700'
    }`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 bg-slate-700 rounded-lg flex items-center justify-center shrink-0">
            <Package size={16} className="text-ocp-red" />
          </div>
          <div className="min-w-0">
            <div className="font-mono font-semibold text-white text-sm">{toolKey}</div>
            <div className="text-xs text-slate-400 mt-0.5">{info.description}</div>
          </div>
        </div>
        <InstalledBadge installed={info.installed} version={info.version} />
      </div>

      {/* 版本 */}
      {info.installed && info.version && (
        <div className="mt-3 px-3 py-2 bg-slate-900/50 rounded-lg">
          <div className="text-xs text-slate-500 mb-0.5">目前版本</div>
          <div className="font-mono text-xs text-green-400 break-all">{info.version}</div>
        </div>
      )}

      {/* 平台不支援 */}
      {!info.available && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-yellow-500">
          <AlertCircle size={11} />
          此工具在 {info.platform} 平台上不提供下載（需在 Linux 上安裝）
        </div>
      )}

      {/* 下載按鈕 */}
      <button
        onClick={() => onDownload(toolKey)}
        disabled={!canDownload}
        className={`mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${
          isDownloading
            ? 'bg-blue-900/40 text-blue-300 border border-blue-700 cursor-wait'
            : canDownload
            ? 'bg-ocp-red/80 hover:bg-ocp-red text-white'
            : 'bg-slate-700 text-slate-500 cursor-not-allowed'
        }`}
      >
        {isDownloading ? (
          <><RefreshCw size={14} className="animate-spin" />下載安裝中…</>
        ) : info.installed ? (
          <><Download size={14} />重新下載 / 更新</>
        ) : (
          <><Download size={14} />下載安裝</>
        )}
      </button>
    </div>
  )
}

// ── 內嵌 Log 檢視器 ─────────────────────────────────────────────────

function DownloadLogViewer({ trigger }: { trigger: number }) {
  const [lines, setLines] = useState<string[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef    = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const esRef        = useRef<EventSource | null>(null)

  const startStream = useCallback(() => {
    setLines([])
    esRef.current?.close()
    const es = new EventSource('/api/tools/download/logs')
    esRef.current = es
    es.onmessage = (e) => {
      if (e.data === '[STREAM_END]') { es.close(); return }
      setLines(prev => [...prev, e.data])
    }
    es.onerror = () => es.close()
  }, [])

  // trigger 變化時重新接 SSE
  useEffect(() => {
    if (trigger > 0) startStream()
    return () => esRef.current?.close()
  }, [trigger, startStream])

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [lines, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
  }

  const stripAnsi = (s: string) => s.replace(/\x1B\[[0-9;]*[mGKHF]/g, '')

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="ml-2 text-slate-300 text-xs font-mono">Download Log</span>
          <span className="text-slate-500 text-xs">({lines.length} 行)</span>
        </div>
        {!autoScroll && (
          <button
            onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-700"
          >
            <ArrowDown size={11} /> 捲到底部
          </button>
        )}
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-64 overflow-auto p-4 font-mono text-xs leading-relaxed"
      >
        {lines.length === 0 ? (
          <div className="text-slate-600 italic">點擊工具卡片上的「下載安裝」後將顯示即時進度…</div>
        ) : (
          lines.map((line, i) => {
            const clean = stripAnsi(line)
            let color = 'text-slate-300'
            if (/\[ERROR\]/i.test(clean))   color = 'text-red-400'
            else if (/\[WARN\]/i.test(clean))    color = 'text-yellow-400'
            else if (/\[SUCCESS\]/i.test(clean)) color = 'text-emerald-300 font-semibold'
            else if (/\[OK\]/i.test(clean))      color = 'text-green-400'
            else if (/\[INFO\]/i.test(clean))    color = 'text-blue-300'
            else if (/\[HINT\]/i.test(clean))    color = 'text-slate-400 italic'
            return (
              <div key={i} className={`${color} whitespace-pre-wrap break-all`}>{clean}</div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── 主頁面 ───────────────────────────────────────────────────────────

export default function ToolsDownload() {
  const [toolsStatus, setToolsStatus]   = useState<Record<string, ToolStatus>>({})
  const [dlState, setDlState]           = useState<DownloadState>({
    status: 'idle', tool: null, version: null,
    started_at: null, finished_at: null, log_lines: 0,
  })
  const [selectedVersion, setSelectedVersion] = useState(OCP_VERSIONS[0])
  const [installDir, setInstallDir]           = useState('/usr/local/bin')
  const [logTrigger, setLogTrigger]           = useState(0)
  const [toast, setToast]                     = useState<string | null>(null)
  const [refreshing, setRefreshing]           = useState(false)

  const isRunning = dlState.status === 'running'

  const showToast = (msg: string) => {
    setToast(msg); setTimeout(() => setToast(null), 4000)
  }

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await getToolsStatus()
      setToolsStatus(data)
    } catch {}
  }, [])

  // 載入時讀 site config，用 ocp_release 當預設版本 + 安裝目錄提示
  useEffect(() => {
    getConfig().then(({ data }) => {
      if (data.ocp_release) setSelectedVersion(data.ocp_release)
      // Windows 提示改用 C:\Tools
      if (navigator.userAgent.includes('Windows')) {
        setInstallDir('C:\\Tools')
      }
    }).catch(() => {})
    loadStatus()
  }, [loadStatus])

  // 輪詢下載狀態
  useEffect(() => {
    const poll = async () => {
      try {
        const res = await fetch('/api/tools/download/state')
        const data = await res.json() as DownloadState
        setDlState(data)
        // 下載結束時重新查詢安裝狀態
        if (data.status === 'success' || data.status === 'failed') {
          loadStatus()
        }
      } catch {}
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [loadStatus])

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadStatus()
    setRefreshing(false)
    showToast('已重新整理安裝狀態')
  }

  const handleDownload = async (toolKey: string) => {
    try {
      await startToolDownload(toolKey, selectedVersion, installDir)
      setLogTrigger(n => n + 1)
      showToast(`開始下載 ${toolKey}@${selectedVersion}`)
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showToast(`錯誤：${detail ?? '啟動失敗'}`)
    }
  }

  const handleReset = async () => {
    try {
      await resetToolsDownload()
      setDlState({ status: 'idle', tool: null, version: null, started_at: null, finished_at: null, log_lines: 0 })
    } catch {}
  }

  const installedCount = Object.values(toolsStatus).filter(t => t.installed).length
  const totalCount = Object.keys(toolsStatus).length

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* 標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Terminal size={20} className="text-ocp-red" />
            CLI 工具下載
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            從 Red Hat mirror 下載 OCP 相關指令工具到本機
          </p>
        </div>
        <a
          href="https://mirror.openshift.com/pub/openshift-v4/clients/ocp/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        >
          <ExternalLink size={12} /> Red Hat Mirror
        </a>
      </div>

      {/* 摘要卡片 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide">已安裝工具</div>
          <div className="text-2xl font-bold text-white mt-1">{installedCount} / {totalCount || '—'}</div>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide">下載版本</div>
          <div className="text-2xl font-bold text-white mt-1 font-mono">{selectedVersion}</div>
        </div>
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wide">下載狀態</div>
          <div className="mt-1">
            {dlState.status === 'idle'    && <span className="text-slate-400 text-sm flex items-center gap-1"><Clock size={14}/> 待機中</span>}
            {dlState.status === 'running' && <span className="text-blue-300 text-sm flex items-center gap-1"><RefreshCw size={14} className="animate-spin"/> 下載中</span>}
            {dlState.status === 'success' && <span className="text-green-300 text-sm flex items-center gap-1"><CheckCircle2 size={14}/> 成功</span>}
            {dlState.status === 'failed'  && <span className="text-red-300 text-sm flex items-center gap-1"><XCircle size={14}/> 失敗</span>}
          </div>
        </div>
      </div>

      {/* 設定列 */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
        <h2 className="text-white font-semibold text-sm">下載設定</h2>
        <div className="grid grid-cols-2 gap-4">
          {/* 版本選擇 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">OCP 版本</label>
            <select
              value={selectedVersion}
              onChange={e => setSelectedVersion(e.target.value)}
              disabled={isRunning}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-ocp-red font-mono disabled:opacity-50"
            >
              {OCP_VERSIONS.map(v => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              來源：mirror.openshift.com/pub/openshift-v4/clients/ocp/{selectedVersion}/
            </p>
          </div>

          {/* 安裝目錄 */}
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 flex items-center gap-1">
              <FolderOpen size={11} /> 安裝目錄
            </label>
            <input
              type="text"
              value={installDir}
              onChange={e => setInstallDir(e.target.value)}
              disabled={isRunning}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-ocp-red font-mono disabled:opacity-50"
            />
            <p className="text-xs text-slate-500 mt-1">
              請確認此目錄已加入系統 PATH 環境變數
            </p>
          </div>
        </div>
      </div>

      {/* 工具卡片 + 重新整理 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-sm">可用工具</h2>
          <button
            onClick={handleRefresh}
            disabled={refreshing || isRunning}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
            重新偵測安裝狀態
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(toolsStatus).map(([key, info]) => (
            <ToolCard
              key={key}
              toolKey={key}
              info={info}
              isDownloading={isRunning && dlState.tool === key}
              onDownload={handleDownload}
            />
          ))}
          {Object.keys(toolsStatus).length === 0 && (
            <div className="col-span-3 flex items-center justify-center py-12 text-slate-500 text-sm gap-2">
              <RefreshCw size={16} className="animate-spin" /> 載入工具狀態…
            </div>
          )}
        </div>
      </div>

      {/* 下載中提示 */}
      {isRunning && dlState.tool && (
        <div className="flex items-center gap-3 p-4 bg-blue-900/20 border border-blue-700 rounded-xl text-blue-300">
          <RefreshCw size={16} className="animate-spin shrink-0" />
          <div>
            <div className="font-semibold text-sm">
              正在下載 {dlState.tool}@{dlState.version}
            </div>
            <div className="text-xs mt-0.5 text-blue-400/80">
              已輸出 {dlState.log_lines} 行 log
            </div>
          </div>
        </div>
      )}

      {/* 完成 / 失敗結果 */}
      {dlState.status === 'success' && (
        <div className="flex items-start gap-3 p-4 bg-green-900/20 border border-green-700 rounded-xl text-green-300">
          <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-sm">{dlState.tool} 安裝成功</div>
            <div className="text-xs mt-0.5 text-green-400/80">
              請確認 {installDir} 已加入 PATH，然後重新開啟終端機
            </div>
          </div>
          <button onClick={handleReset} className="text-slate-400 hover:text-white">
            <RotateCcw size={14} />
          </button>
        </div>
      )}

      {dlState.status === 'failed' && (
        <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-700 rounded-xl text-red-300">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-semibold text-sm">下載失敗</div>
            <div className="text-xs mt-0.5 text-red-400/80">請查看下方 Log 了解詳細原因</div>
          </div>
          <button onClick={handleReset} className="text-slate-400 hover:text-white">
            <RotateCcw size={14} />
          </button>
        </div>
      )}

      {/* Log 檢視器 */}
      <div>
        <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
          <Terminal size={15} className="text-ocp-red" />
          下載 Log
        </h2>
        <DownloadLogViewer trigger={logTrigger} />
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 bg-slate-800 border border-slate-600 text-white text-sm px-4 py-3 rounded-xl shadow-xl z-50">
          {toast}
        </div>
      )}
    </div>
  )
}
