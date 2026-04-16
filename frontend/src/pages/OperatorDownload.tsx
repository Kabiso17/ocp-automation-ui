/**
 * OperatorDownload.tsx
 * ------------------------------------------------------------------
 * Operator 映像下載頁面
 *
 * 功能：
 * 1. 顯示目前 imageset-config.yaml 中設定的 operator 清單
 * 2. 設定 oc-mirror 目標（docker:// 或 file://）
 * 3. 觸發 oc-mirror 下載並即時串流 log
 * 4. 顯示下載狀態與歷史記錄
 * ------------------------------------------------------------------
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Download, Play, RotateCcw, CheckCircle2, XCircle,
  Clock, Package, Terminal, AlertCircle, RefreshCw,
  ChevronDown, ArrowDown, Server, HardDrive,
} from 'lucide-react'
import {
  getImageset, getConfig,
  getMirrorStatus, startMirrorDownload, resetMirror,
} from '../api/client'
import type { MirrorStatus, ImagesetPackage } from '../types'

// ── 狀態徽章 ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: MirrorStatus['status'] }) {
  const cfg = {
    idle:    { label: '尚未執行', cls: 'bg-slate-700 text-slate-300', Icon: Clock },
    running: { label: '執行中',   cls: 'bg-blue-900/50 text-blue-300 border border-blue-600 animate-pulse', Icon: RefreshCw },
    success: { label: '成功',     cls: 'bg-green-900/40 text-green-300 border border-green-700', Icon: CheckCircle2 },
    failed:  { label: '失敗',     cls: 'bg-red-900/40 text-red-300 border border-red-700', Icon: XCircle },
  }[status] ?? { label: status, cls: 'bg-slate-700 text-slate-400', Icon: Clock }

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${cfg.cls}`}>
      <cfg.Icon size={14} className={status === 'running' ? 'animate-spin' : ''} />
      {cfg.label}
    </span>
  )
}

// ── 內嵌 Log 檢視器 ─────────────────────────────────────────────────

function InlineLogViewer({ isRunning }: { isRunning: boolean }) {
  const [lines, setLines]         = useState<string[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef   = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const esRef       = useRef<EventSource | null>(null)

  const startStream = useCallback(() => {
    setLines([])
    esRef.current?.close()
    const es = new EventSource('/api/mirror/logs')
    esRef.current = es
    es.onmessage = (e) => {
      if (e.data === '[STREAM_END]') { es.close(); return }
      setLines(prev => [...prev, e.data])
    }
    es.onerror = () => es.close()
  }, [])

  useEffect(() => {
    startStream()
    return () => esRef.current?.close()
  }, [startStream])

  // 每次 isRunning 從 false → true 時重新接流
  const prevRunning = useRef(false)
  useEffect(() => {
    if (isRunning && !prevRunning.current) startStream()
    prevRunning.current = isRunning
  }, [isRunning, startStream])

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
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700 bg-slate-800">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500" />
          <span className="ml-2 text-slate-300 text-xs font-mono">oc-mirror — Log</span>
          <span className="text-slate-500 text-xs ml-1">({lines.length} 行)</span>
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

      {/* Log content */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-80 overflow-auto p-4 font-mono text-xs leading-relaxed"
      >
        {lines.length === 0 ? (
          <div className="text-slate-600 italic">
            {isRunning ? '等待 oc-mirror 輸出…' : '尚無 log，點擊「開始下載」後將顯示即時輸出'}
          </div>
        ) : (
          lines.map((line, i) => {
            const clean = stripAnsi(line)
            let color = 'text-slate-300'
            if (/ERROR|FAILED|error/i.test(clean)) color = 'text-red-400'
            else if (/WARNING|WARN/i.test(clean)) color = 'text-yellow-400'
            else if (/INFO|success/i.test(clean)) color = 'text-green-400'
            else if (/\[INFO\]/i.test(clean)) color = 'text-blue-300'
            return (
              <div key={i} className={`${color} whitespace-pre-wrap break-all`}>
                {clean}
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

// ── 主頁面 ───────────────────────────────────────────────────────────

export default function OperatorDownload() {
  const [mirrorStatus, setMirrorStatus] = useState<MirrorStatus>({
    status: 'idle', started_at: null, finished_at: null,
    exit_code: null, log_lines: 0, command: null,
  })
  const [packages, setPackages]         = useState<ImagesetPackage[]>([])
  const [catalogTag, setCatalogTag]     = useState('v4.20')
  const [destType, setDestType]         = useState<'docker' | 'file'>('docker')
  const [registryHost, setRegistryHost] = useState('')
  const [filePath, setFilePath]         = useState('/tmp/oc-mirror-output')
  const [workspace, setWorkspace]       = useState('/tmp/oc-mirror-workspace')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [toast, setToast]               = useState<string | null>(null)
  const [starting, setStarting]         = useState(false)
  const [resetting, setResetting]       = useState(false)

  const isRunning = mirrorStatus.status === 'running'

  const showToast = (msg: string) => {
    setToast(msg); setTimeout(() => setToast(null), 4000)
  }

  // 載入 imageset + site config
  useEffect(() => {
    getImageset().then(({ data }) => {
      const entry = data.mirror.operators?.[0]
      if (entry) {
        setPackages(entry.packages ?? [])
        setCatalogTag(entry.catalog?.split(':')[1] ?? 'v4.20')
      }
    }).catch(() => {})

    getConfig().then(({ data }) => {
      if (data.bastion_ip) {
        setRegistryHost(`${data.bastion_ip}:5000`)
      }
    }).catch(() => {})
  }, [])

  // 輪詢狀態
  useEffect(() => {
    const poll = async () => {
      try {
        const { data } = await getMirrorStatus()
        setMirrorStatus(data)
      } catch {}
    }
    poll()
    const id = setInterval(poll, 2000)
    return () => clearInterval(id)
  }, [])

  const destination = destType === 'docker'
    ? `docker://${registryHost}/mirror/oc-mirror`
    : `file://${filePath}`

  const handleStart = async () => {
    if (!registryHost && destType === 'docker') {
      showToast('請輸入 Registry 位址')
      return
    }
    setStarting(true)
    try {
      await startMirrorDownload(destination, workspace)
      showToast('oc-mirror 下載已啟動')
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showToast(`錯誤：${detail ?? '啟動失敗'}`)
    } finally {
      setStarting(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      await resetMirror()
      setMirrorStatus(prev => ({ ...prev, status: 'idle', started_at: null, finished_at: null, exit_code: null, log_lines: 0, command: null }))
      showToast('狀態已重置')
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      showToast(`錯誤：${detail ?? '重置失敗'}`)
    } finally {
      setResetting(false)
    }
  }

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start) return '—'
    const s = new Date(start)
    const e = end ? new Date(end) : new Date()
    const sec = Math.floor((e.getTime() - s.getTime()) / 1000)
    const m = Math.floor(sec / 60), r = sec % 60
    return m > 0 ? `${m} 分 ${r} 秒` : `${r} 秒`
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* 標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Download size={20} className="text-ocp-red" />
            Operator 映像下載
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            使用 oc-mirror 將 imageset-config.yaml 中設定的 Operator 映像同步到目標
          </p>
        </div>
        <StatusBadge status={mirrorStatus.status} />
      </div>

      {/* 狀態摘要 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Operators', value: packages.length, sub: 'imageset 設定中' },
          { label: 'Catalog', value: catalogTag, sub: 'redhat-operator-index' },
          {
            label: '執行時間',
            value: formatDuration(mirrorStatus.started_at, mirrorStatus.finished_at),
            sub: mirrorStatus.started_at
              ? `開始 ${new Date(mirrorStatus.started_at).toLocaleTimeString('zh-TW')}`
              : '尚未啟動',
          },
          {
            label: 'Log 行數',
            value: mirrorStatus.log_lines,
            sub: mirrorStatus.exit_code != null ? `exit ${mirrorStatus.exit_code}` : '—',
          },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold text-white mt-1">{value}</div>
            <div className="text-xs text-slate-500 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* Operator 清單 */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700">
          <h2 className="text-white font-semibold flex items-center gap-2 text-sm">
            <Package size={15} className="text-ocp-red" />
            待下載 Operators（{packages.length} 個）
          </h2>
          <span className="text-xs text-slate-500">來源：imageset-config.yaml</span>
        </div>
        {packages.length === 0 ? (
          <div className="px-5 py-8 text-center text-slate-500 text-sm">
            <Package size={32} className="mx-auto mb-2 opacity-30" />
            imageset 中尚無 Operator，請先至「ImageSet」頁面新增
          </div>
        ) : (
          <div className="divide-y divide-slate-700 max-h-52 overflow-y-auto">
            {packages.map(pkg => (
              <div key={pkg.name} className="flex items-center justify-between px-5 py-2.5 hover:bg-slate-800/60">
                <div className="flex items-center gap-2">
                  <Package size={13} className="text-slate-500 shrink-0" />
                  <span className="font-mono text-sm text-white">{pkg.name}</span>
                </div>
                <div className="flex flex-wrap gap-1 justify-end">
                  {pkg.channels.map(ch => (
                    <span key={ch.name} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                      {ch.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 目標設定 */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-5 space-y-4">
        <h2 className="text-white font-semibold text-sm flex items-center gap-2">
          <Terminal size={15} className="text-ocp-red" />
          下載目標設定
        </h2>

        {/* 目標類型 */}
        <div className="flex gap-3">
          {([
            { value: 'docker', label: 'Registry（推送）', Icon: Server,    desc: 'docker://<host>:<port>' },
            { value: 'file',   label: '本地磁碟（封存）', Icon: HardDrive, desc: 'file:///output/path' },
          ] as const).map(({ value, label, Icon, desc }) => (
            <button
              key={value}
              onClick={() => setDestType(value)}
              className={`flex-1 flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                destType === value
                  ? 'border-ocp-red bg-ocp-red/10 text-white'
                  : 'border-slate-600 bg-slate-900 text-slate-400 hover:border-slate-500'
              }`}
            >
              <Icon size={16} className={destType === value ? 'text-ocp-red' : ''} />
              <div>
                <div className="text-sm font-medium">{label}</div>
                <div className="text-xs text-slate-500 font-mono">{desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* 目標輸入 */}
        {destType === 'docker' ? (
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">Registry 位址（host:port）</label>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-sm font-mono">docker://</span>
              <input
                type="text"
                value={registryHost}
                onChange={e => setRegistryHost(e.target.value)}
                placeholder="192.168.1.10:5000"
                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-ocp-red font-mono"
              />
              <span className="text-slate-500 text-sm font-mono">/mirror/oc-mirror</span>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs text-slate-400 mb-1.5">本地輸出路徑</label>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 text-sm font-mono">file://</span>
              <input
                type="text"
                value={filePath}
                onChange={e => setFilePath(e.target.value)}
                placeholder="/tmp/oc-mirror-output"
                className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-ocp-red font-mono"
              />
            </div>
          </div>
        )}

        {/* 等效指令預覽 */}
        <div className="bg-slate-900/60 rounded-lg p-3 border border-slate-700">
          <div className="text-xs text-slate-500 mb-1 font-medium">等效指令：</div>
          <code className="text-xs text-green-300 font-mono break-all">
            oc-mirror --config={'{imageset-config.yaml}'} --workspace={workspace} {destination}
          </code>
        </div>

        {/* 進階選項 */}
        <button
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
          onClick={() => setShowAdvanced(v => !v)}
        >
          <ChevronDown size={12} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
          進階選項
        </button>

        {showAdvanced && (
          <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700 space-y-3">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Workspace 路徑</label>
              <input
                type="text"
                value={workspace}
                onChange={e => setWorkspace(e.target.value)}
                className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none font-mono"
              />
              <p className="text-xs text-slate-500 mt-1">oc-mirror 工作目錄，用於儲存中繼資料與差異記錄</p>
            </div>
          </div>
        )}
      </div>

      {/* 操作按鈕 */}
      <div className="flex gap-3">
        <button
          onClick={handleStart}
          disabled={isRunning || starting || packages.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-ocp-red hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-medium text-sm transition-colors"
        >
          {isRunning || starting
            ? <><RefreshCw size={15} className="animate-spin" />執行中…</>
            : <><Play size={15} />開始下載</>}
        </button>

        {(mirrorStatus.status === 'success' || mirrorStatus.status === 'failed') && (
          <button
            onClick={handleReset}
            disabled={resetting}
            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-lg text-sm transition-colors"
          >
            <RotateCcw size={14} />重置狀態
          </button>
        )}
      </div>

      {/* 結果提示 */}
      {mirrorStatus.status === 'success' && (
        <div className="flex items-start gap-3 p-4 bg-green-900/20 border border-green-700 rounded-xl text-green-300">
          <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-sm">下載完成</div>
            <div className="text-xs mt-1 text-green-400/80">
              耗時 {formatDuration(mirrorStatus.started_at, mirrorStatus.finished_at)}，共輸出 {mirrorStatus.log_lines} 行 log
            </div>
          </div>
        </div>
      )}

      {mirrorStatus.status === 'failed' && (
        <div className="flex items-start gap-3 p-4 bg-red-900/20 border border-red-700 rounded-xl text-red-300">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-sm">下載失敗（exit code: {mirrorStatus.exit_code}）</div>
            <div className="text-xs mt-1 text-red-400/80">請查看下方 Log 了解詳細錯誤原因</div>
          </div>
        </div>
      )}

      {/* Log 檢視器 */}
      <div>
        <h2 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
          <Terminal size={15} className="text-ocp-red" />
          即時 Log
        </h2>
        <InlineLogViewer isRunning={isRunning} />
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
