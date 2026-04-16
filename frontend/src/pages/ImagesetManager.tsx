/**
 * ImagesetManager.tsx
 * ------------------------------------------------------------------
 * Operator 查詢 & ImageSet 管理頁面
 *
 * 功能：
 * 1. 顯示目前 imageset-config.yaml 的 operator 清單
 * 2. 使用者輸入 operator 名稱 → 呼叫 oc-mirror list operators 查版本
 * 3. 選擇頻道與版本後加入 imageset
 * 4. 支援刪除 / 匯出 YAML
 * ------------------------------------------------------------------
 */

import { useState, useEffect, useCallback } from 'react'
import {
  Search, Plus, Trash2, Download, RefreshCw,
  ChevronDown, ChevronUp, AlertCircle, CheckCircle2,
  Clock, Package, Copy, Check,
} from 'lucide-react'
import {
  getImageset, searchOperator, addOperator,
  removeOperator, exportImagesetYaml,
} from '../api/client'
import type {
  ImagesetConfig, ImagesetPackage, OperatorChannelResult,
} from '../types'

// ── 小工具元件 ──────────────────────────────────────────────────────

function StatusBadge({ children, variant }: {
  children: React.ReactNode
  variant: 'info' | 'success' | 'error' | 'warning'
}) {
  const cls = {
    info: 'bg-blue-900/40 text-blue-300 border border-blue-700',
    success: 'bg-green-900/40 text-green-300 border border-green-700',
    error: 'bg-red-900/40 text-red-300 border border-red-700',
    warning: 'bg-yellow-900/40 text-yellow-300 border border-yellow-700',
  }[variant]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono ${cls}`}>
      {children}
    </span>
  )
}

// ── 搜尋結果列表 ────────────────────────────────────────────────────

function SearchResultList({
  channels,
  operatorName,
  catalogTag,
  onAdded,
}: {
  channels: OperatorChannelResult[]
  operatorName: string
  catalogTag: string
  onAdded: () => void
}) {
  const [adding, setAdding] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [err, setErr] = useState<string | null>(null)

  const handleAdd = async (ch: OperatorChannelResult) => {
    const key = `${ch.channel}-${ch.head_version}`
    setAdding(key)
    setErr(null)
    try {
      await addOperator(operatorName, ch.channel, ch.head_version, catalogTag)
      setDone(prev => new Set([...prev, key]))
      onAdded()
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setErr(msg)
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="mt-3 border border-slate-700 rounded-lg overflow-hidden">
      <div className="bg-slate-800 px-4 py-2 text-xs text-slate-400 font-semibold uppercase tracking-wide">
        可用頻道（共 {channels.length} 個）
      </div>
      {err && (
        <div className="px-4 py-2 bg-red-900/30 text-red-300 text-sm flex items-center gap-2">
          <AlertCircle size={14} /> {err}
        </div>
      )}
      <div className="divide-y divide-slate-700">
        {channels.map(ch => {
          const key = `${ch.channel}-${ch.head_version}`
          const isAdded = done.has(key)
          const isAdding = adding === key
          return (
            <div
              key={key}
              className="flex items-center justify-between px-4 py-3 hover:bg-slate-800/50"
            >
              <div className="flex items-center gap-3">
                <div>
                  <div className="text-sm text-white font-medium">{ch.channel}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    最新版本：<span className="font-mono text-emerald-400">{ch.head_version}</span>
                  </div>
                </div>
              </div>
              <button
                onClick={() => handleAdd(ch)}
                disabled={isAdding || isAdded}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  isAdded
                    ? 'bg-green-800/40 text-green-300 cursor-default'
                    : isAdding
                    ? 'bg-slate-700 text-slate-400 cursor-wait'
                    : 'bg-ocp-red/80 hover:bg-ocp-red text-white'
                }`}
              >
                {isAdded ? (
                  <><Check size={12} />已加入</>
                ) : isAdding ? (
                  <><RefreshCw size={12} className="animate-spin" />加入中…</>
                ) : (
                  <><Plus size={12} />加入 ImageSet</>
                )}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 搜尋區塊 ────────────────────────────────────────────────────────

function SearchPanel({ catalogTag, onAdded }: {
  catalogTag: string
  onAdded: () => void
}) {
  const [operatorName, setOperatorName] = useState('')
  const [ocpVersion, setOcpVersion] = useState('4.20')
  const [imageTimeout, setImageTimeout] = useState('30m')
  const [searching, setSearching] = useState(false)
  const [searchResult, setSearchResult] = useState<{
    success: boolean; error?: string; channels: OperatorChannelResult[]
  } | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const handleSearch = async () => {
    if (!operatorName.trim()) return
    setSearching(true)
    setSearchResult(null)
    try {
      const { data } = await searchOperator(
        operatorName.trim(),
        ocpVersion,
        imageTimeout,
      )
      setSearchResult(data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setSearchResult({ success: false, error: msg, channels: [] })
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
        <Search size={16} className="text-ocp-red" />
        搜尋 Operator 版本
      </h3>

      {/* 主搜尋列 */}
      <div className="flex gap-2">
        <input
          type="text"
          value={operatorName}
          onChange={e => setOperatorName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder="輸入 Operator 名稱，例如：kubevirt-hyperconverged"
          className="flex-1 bg-slate-900 border border-slate-600 rounded-lg px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-ocp-red"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !operatorName.trim()}
          className="flex items-center gap-2 px-4 py-2.5 bg-ocp-red/80 hover:bg-ocp-red disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
        >
          {searching ? (
            <><RefreshCw size={14} className="animate-spin" />查詢中…</>
          ) : (
            <><Search size={14} />查詢</>
          )}
        </button>
      </div>

      {/* 進階選項 */}
      <button
        className="mt-3 flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
        onClick={() => setShowAdvanced(v => !v)}
      >
        {showAdvanced ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        進階選項
      </button>

      {showAdvanced && (
        <div className="mt-3 grid grid-cols-2 gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
          <div>
            <label className="block text-xs text-slate-400 mb-1">OCP 版本</label>
            <select
              value={ocpVersion}
              onChange={e => setOcpVersion(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none"
            >
              <option>4.20</option>
              <option>4.19</option>
              <option>4.18</option>
              <option>4.17</option>
              <option>4.16</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1">
              <Clock size={10} />
              Image Timeout
              <span className="text-slate-500">（避免 catalog 拉取超時）</span>
            </label>
            <select
              value={imageTimeout}
              onChange={e => setImageTimeout(e.target.value)}
              className="w-full bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-white focus:outline-none"
            >
              <option value="10m">10 分鐘</option>
              <option value="30m">30 分鐘（預設）</option>
              <option value="60m">60 分鐘</option>
              <option value="120m">120 分鐘</option>
            </select>
          </div>
          <div className="col-span-2 text-xs text-slate-500">
            💡 對應 <code className="bg-slate-800 px-1 rounded">oc-mirror --image-timeout={imageTimeout} list operators --catalog=registry.redhat.io/redhat/redhat-operator-index:v{ocpVersion} --package={operatorName || '<name>'}</code>
          </div>
        </div>
      )}

      {/* 搜尋結果 */}
      {searching && (
        <div className="mt-4 flex items-center gap-3 text-slate-400 text-sm">
          <RefreshCw size={16} className="animate-spin text-ocp-red" />
          正在拉取 catalog index，這可能需要數分鐘（取決於網路速度）…
        </div>
      )}

      {searchResult && (
        <div className="mt-3">
          {searchResult.success ? (
            searchResult.channels.length > 0 ? (
              <SearchResultList
                channels={searchResult.channels}
                operatorName={operatorName.trim()}
                catalogTag={catalogTag}
                onAdded={onAdded}
              />
            ) : (
              <div className="mt-3 p-3 bg-yellow-900/20 border border-yellow-700 rounded-lg text-yellow-300 text-sm flex items-center gap-2">
                <AlertCircle size={14} />
                找不到此 Operator，請確認名稱是否正確
              </div>
            )
          ) : (
            <div className="mt-3 p-3 bg-red-900/20 border border-red-700 rounded-lg">
              <div className="text-red-300 text-sm font-medium flex items-center gap-2">
                <AlertCircle size={14} /> 查詢失敗
              </div>
              <pre className="mt-2 text-red-400 text-xs whitespace-pre-wrap break-all">
                {searchResult.error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Operator 表格列 ─────────────────────────────────────────────────

function OperatorRow({
  pkg,
  catalogTag,
  onRemove,
}: {
  pkg: ImagesetPackage
  catalogTag: string
  onRemove: (name: string) => void
}) {
  const [removing, setRemoving] = useState(false)

  const handleRemove = async () => {
    if (!confirm(`確定要從 imageset 移除 ${pkg.name}？`)) return
    setRemoving(true)
    try {
      await removeOperator(pkg.name, catalogTag)
      onRemove(pkg.name)
    } finally {
      setRemoving(false)
    }
  }

  return (
    <tr className="border-t border-slate-700 hover:bg-slate-800/40">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Package size={14} className="text-slate-500 shrink-0" />
          <span className="font-mono text-sm text-white">{pkg.name}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {pkg.channels.map(ch => (
            <div key={ch.name} className="flex items-center gap-1">
              <StatusBadge variant="info">{ch.name}</StatusBadge>
              <span className="text-xs text-slate-400">
                <span className="font-mono text-emerald-400">{ch.minVersion}</span>
                {ch.minVersion !== ch.maxVersion && (
                  <> → <span className="font-mono text-emerald-400">{ch.maxVersion}</span></>
                )}
              </span>
            </div>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <button
          onClick={handleRemove}
          disabled={removing}
          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 transition-colors disabled:opacity-50"
        >
          {removing ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
          移除
        </button>
      </td>
    </tr>
  )
}

// ── YAML 匯出 Modal ─────────────────────────────────────────────────

function ExportModal({ onClose }: { onClose: () => void }) {
  const [yaml, setYaml] = useState('')
  const [copied, setCopied] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    exportImagesetYaml().then(({ data }) => {
      setYaml(data.yaml)
      setLoading(false)
    })
  }, [])

  const handleCopy = () => {
    navigator.clipboard.writeText(yaml)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h3 className="text-white font-semibold">imageset-config.yaml</h3>
          <div className="flex gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-medium transition-colors"
            >
              {copied ? <><Check size={12} />已複製</> : <><Copy size={12} />複製</>}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-medium transition-colors"
            >
              關閉
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-5">
          {loading ? (
            <div className="flex items-center gap-2 text-slate-400">
              <RefreshCw size={14} className="animate-spin" /> 載入中…
            </div>
          ) : (
            <pre className="text-xs text-green-300 font-mono whitespace-pre leading-relaxed">
              {yaml}
            </pre>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 主頁面 ───────────────────────────────────────────────────────────

export default function ImagesetManager() {
  const [imageset, setImageset] = useState<ImagesetConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showExport, setShowExport] = useState(false)

  // 目前只支援第一個 catalog（redhat-operator-index）
  const catalogEntry = imageset?.mirror.operators?.[0]
  const catalogTag = catalogEntry?.catalog?.split(':')[1] ?? 'v4.20'
  const packages = catalogEntry?.packages ?? []

  const loadImageset = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await getImageset()
      setImageset(data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setError(msg)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadImageset() }, [loadImageset])

  const handleRemove = (name: string) => {
    setImageset(prev => {
      if (!prev) return prev
      const copy = JSON.parse(JSON.stringify(prev)) as ImagesetConfig
      if (copy.mirror.operators[0]) {
        copy.mirror.operators[0].packages = copy.mirror.operators[0].packages.filter(
          p => p.name !== name,
        )
      }
      return copy
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400 gap-3">
        <RefreshCw size={20} className="animate-spin" /> 載入 imageset 設定…
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-900/20 border border-red-700 rounded-xl p-5 text-red-300 flex items-start gap-3">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">載入失敗</div>
            <div className="text-sm mt-1">{error}</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* 標題列 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">ImageSet 管理</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            管理 oc-mirror 映像清單（imageset-config.yaml）
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadImageset}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
          >
            <RefreshCw size={14} /> 重新整理
          </button>
          <button
            onClick={() => setShowExport(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
          >
            <Download size={14} /> 查看 YAML
          </button>
        </div>
      </div>

      {/* 摘要 */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Catalog', value: catalogEntry?.catalog?.split('/').pop() ?? '-' },
          { label: 'Operators 數量', value: packages.length },
          {
            label: 'Additional Images',
            value: imageset?.mirror.additionalImages?.length ?? 0,
          },
        ].map(({ label, value }) => (
          <div key={label} className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <div className="text-xs text-slate-400 uppercase tracking-wide">{label}</div>
            <div className="text-2xl font-bold text-white mt-1">{value}</div>
          </div>
        ))}
      </div>

      {/* Operator 清單 */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Package size={16} className="text-ocp-red" />
            Operators 清單
          </h2>
          {packages.length > 0 && (
            <StatusBadge variant="success">
              <CheckCircle2 size={10} />
              {packages.length} 個 operator
            </StatusBadge>
          )}
        </div>

        {packages.length === 0 ? (
          <div className="px-5 py-10 text-center text-slate-500 text-sm">
            尚未加入任何 Operator，請使用下方搜尋功能新增
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-xs text-slate-400 uppercase tracking-wide">
                <th className="px-4 py-2.5 text-left font-medium">Operator 名稱</th>
                <th className="px-4 py-2.5 text-left font-medium">頻道 / 版本</th>
                <th className="px-4 py-2.5 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {packages.map(pkg => (
                <OperatorRow
                  key={pkg.name}
                  pkg={pkg}
                  catalogTag={catalogTag}
                  onRemove={handleRemove}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 搜尋新增區塊 */}
      <SearchPanel catalogTag={catalogTag} onAdded={loadImageset} />

      {/* Additional Images 唯讀顯示 */}
      {imageset?.mirror.additionalImages && imageset.mirror.additionalImages.length > 0 && (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700">
            <h2 className="text-white font-semibold">Additional Images</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              如需修改請直接編輯 automation/yaml/imageset-config.yaml
            </p>
          </div>
          <div className="divide-y divide-slate-700">
            {imageset.mirror.additionalImages.map(img => (
              <div key={img.name} className="px-5 py-2.5 font-mono text-xs text-slate-300">
                {img.name}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* YAML 匯出 Modal */}
      {showExport && <ExportModal onClose={() => setShowExport(false)} />}
    </div>
  )
}
