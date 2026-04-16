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
  Package, Copy, Check, Database,
} from 'lucide-react'
import {
  getImageset, searchOperator, addOperator,
  removeOperator, exportImagesetYaml, listCatalogOperators,
} from '../api/client'
import type {
  ImagesetConfig, ImagesetPackage, OperatorChannelResult, CatalogOperator,
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

function SearchPanel({ catalogTag, pullSecret, onAdded }: {
  catalogTag: string
  pullSecret: string
  onAdded: () => void
}) {
  const [operatorName, setOperatorName] = useState('')
  const [ocpVersion, setOcpVersion] = useState('4.20')
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
        pullSecret,
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
        <div className="mt-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700">
          <div className="w-48">
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
          <div className="mt-2 text-xs text-slate-500">
            對應指令：<code className="bg-slate-800 px-1 rounded">oc-mirror --v1 --registry-config={pullSecret} list operators --catalog=registry.redhat.io/redhat/redhat-operator-index:v{ocpVersion} --package={operatorName || '<name>'}</code>
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

// ── Catalog 瀏覽器 ───────────────────────────────────────────────────

function CatalogBrowser({ catalogTag, pullSecret, onAdded }: {
  catalogTag: string
  pullSecret: string
  onAdded: () => void
}) {
  const [ocpVersion, setOcpVersion] = useState('4.20')
  const [loading, setLoading] = useState(false)
  const [collapsed, setCollapsed] = useState(true)
  const [result, setResult] = useState<{
    success: boolean
    error?: string
    catalog?: string
    total: number
    operators: CatalogOperator[]
  } | null>(null)
  const [filter, setFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [channelCache, setChannelCache] = useState<
    Record<string, { loading: boolean; channels: OperatorChannelResult[]; error?: string }>
  >({})

  const handleLoad = async () => {
    setLoading(true)
    setResult(null)
    setFilter('')
    setExpanded(null)
    setChannelCache({})
    try {
      const { data } = await listCatalogOperators(ocpVersion, pullSecret)
      setResult(data)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setResult({ success: false, error: msg, total: 0, operators: [] })
    } finally {
      setLoading(false)
    }
  }

  const handleExpandRow = async (opName: string) => {
    if (expanded === opName) {
      setExpanded(null)
      return
    }
    setExpanded(opName)
    if (!channelCache[opName]) {
      setChannelCache(prev => ({ ...prev, [opName]: { loading: true, channels: [] } }))
      try {
        const { data } = await searchOperator(opName, ocpVersion, pullSecret)
        setChannelCache(prev => ({
          ...prev,
          [opName]: { loading: false, channels: data.channels, error: data.error },
        }))
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        setChannelCache(prev => ({
          ...prev,
          [opName]: { loading: false, channels: [], error: msg },
        }))
      }
    }
  }

  const filtered = (result?.operators ?? []).filter(op =>
    !filter ||
    op.name.toLowerCase().includes(filter.toLowerCase()) ||
    op.display_name.toLowerCase().includes(filter.toLowerCase()),
  )

  return (
    <div className="bg-slate-800 rounded-xl border border-slate-700">
      {/* 標題列（可折疊） */}
      <button
        className="w-full flex items-center justify-between px-5 py-4 text-left"
        onClick={() => setCollapsed(v => !v)}
      >
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Database size={16} className="text-ocp-red" />
          瀏覽所有可用 Operators
          {result?.success && (
            <span className="ml-1 text-xs text-slate-400 font-normal">
              共 {result.total} 個
            </span>
          )}
        </h3>
        {collapsed
          ? <ChevronDown size={16} className="text-slate-400" />
          : <ChevronUp size={16} className="text-slate-400" />
        }
      </button>

      {!collapsed && (
        <div className="px-5 pb-5 border-t border-slate-700">
          {/* 控制列 */}
          <div className="mt-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-400 mb-1">OCP 版本</label>
              <select
                value={ocpVersion}
                onChange={e => setOcpVersion(e.target.value)}
                disabled={loading}
                className="bg-slate-900 border border-slate-600 rounded px-3 py-2 text-sm text-white focus:outline-none disabled:opacity-50"
              >
                {['4.20', '4.19', '4.18', '4.17', '4.16'].map(v => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleLoad}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 bg-ocp-red/80 hover:bg-ocp-red disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
            >
              {loading
                ? <><RefreshCw size={14} className="animate-spin" />載入中…</>
                : <><Database size={14} />載入所有 Operators</>
              }
            </button>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            對應指令：
            <code className="bg-slate-900 px-1 py-0.5 rounded font-mono">
              oc-mirror --v1 --registry-config={pullSecret} list operators --catalog=registry.redhat.io/redhat/redhat-operator-index:v{ocpVersion}
            </code>
          </p>
          <p className="mt-1 text-xs text-yellow-600/80">
            ⚠️ list operators 指令目前僅 oc-mirror v1 支援（v2 尚未提供對應功能）
          </p>

          {loading && (
            <div className="mt-4 p-3 bg-yellow-900/20 border border-yellow-700/50 rounded-lg text-yellow-300 text-sm flex items-start gap-2">
              <RefreshCw size={14} className="animate-spin shrink-0 mt-0.5" />
              <span>
                正在從 Red Hat catalog 拉取 Operator 清單，首次執行需要 <strong>5～30 分鐘</strong>（取決於網路速度）。
                拉取完成後結果會快取，後續查詢較快。請耐心等待…
              </span>
            </div>
          )}

          {result && !result.success && (
            <div className="mt-4 p-3 bg-red-900/20 border border-red-700 rounded-lg">
              <div className="text-red-300 text-sm font-medium flex items-center gap-2">
                <AlertCircle size={14} /> 載入失敗
              </div>
              <pre className="mt-2 text-red-400 text-xs whitespace-pre-wrap break-all">
                {result.error}
              </pre>
            </div>
          )}

          {result?.success && (
            <div className="mt-4 space-y-3">
              {/* 篩選列 */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={filter}
                    onChange={e => setFilter(e.target.value)}
                    placeholder="篩選 Operator 名稱或描述…"
                    className="w-full bg-slate-900 border border-slate-600 rounded-lg pl-9 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-ocp-red"
                  />
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  顯示 {filtered.length} / {result.total}
                </span>
              </div>

              {/* Operator 表格 */}
              <div className="border border-slate-700 rounded-lg overflow-hidden">
                <div className="max-h-[480px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-900 z-10">
                      <tr className="text-xs text-slate-400 uppercase tracking-wide border-b border-slate-700">
                        <th className="px-4 py-2.5 text-left font-medium w-64">名稱</th>
                        <th className="px-4 py-2.5 text-left font-medium hidden lg:table-cell">說明</th>
                        <th className="px-4 py-2.5 text-left font-medium w-36">預設頻道</th>
                        <th className="px-4 py-2.5 text-right font-medium w-24">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(op => (
                        <tr key={op.name} className="border-t border-slate-700/60 hover:bg-slate-700/20">
                          {/* 名稱 */}
                          <td className="px-4 py-2.5 align-top">
                            <span className="font-mono text-xs text-white break-all">{op.name}</span>
                          </td>
                          {/* 說明 */}
                          <td className="px-4 py-2.5 hidden lg:table-cell align-top">
                            <span className="text-xs text-slate-400">{op.display_name}</span>
                          </td>
                          {/* 預設頻道 */}
                          <td className="px-4 py-2.5 align-top">
                            <span className="font-mono text-xs text-emerald-400">{op.default_channel}</span>
                          </td>
                          {/* 操作 */}
                          <td className="px-4 py-2.5 align-top text-right">
                            <button
                              onClick={() => handleExpandRow(op.name)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                                expanded === op.name
                                  ? 'bg-ocp-red/20 text-ocp-red border border-ocp-red/40'
                                  : 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                              }`}
                            >
                              {expanded === op.name
                                ? <><ChevronUp size={11} />收起</>
                                : <><Plus size={11} />加入</>
                              }
                            </button>
                          </td>
                        </tr>
                      ))}
                      {/* 展開的頻道列 */}
                      {filtered.map(op =>
                        expanded === op.name ? (
                          <tr key={`${op.name}__expanded`} className="border-t border-slate-700/60 bg-slate-900/60">
                            <td colSpan={4} className="px-6 py-3">
                              {channelCache[op.name]?.loading ? (
                                <div className="flex items-center gap-2 text-slate-400 text-sm py-1">
                                  <RefreshCw size={13} className="animate-spin text-ocp-red" />
                                  正在查詢 {op.name} 的頻道資訊…
                                </div>
                              ) : channelCache[op.name]?.error ? (
                                <div className="text-red-400 text-xs flex items-center gap-2 py-1">
                                  <AlertCircle size={12} />
                                  {channelCache[op.name]?.error}
                                </div>
                              ) : (channelCache[op.name]?.channels?.length ?? 0) > 0 ? (
                                <SearchResultList
                                  channels={channelCache[op.name].channels}
                                  operatorName={op.name}
                                  catalogTag={catalogTag}
                                  onAdded={onAdded}
                                />
                              ) : (
                                <div className="text-slate-500 text-xs py-1">尚無頻道資訊</div>
                              )}
                            </td>
                          </tr>
                        ) : null,
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── 主頁面 ───────────────────────────────────────────────────────────

export default function ImagesetManager() {
  const [imageset, setImageset] = useState<ImagesetConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showExport, setShowExport] = useState(false)
  const [pullSecret, setPullSecret] = useState('/root/pull-secret')

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

      {/* Pull Secret 設定 */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 px-5 py-3 flex items-center gap-4">
        <span className="text-xs text-slate-400 shrink-0">Pull Secret 路徑</span>
        <input
          type="text"
          value={pullSecret}
          onChange={e => setPullSecret(e.target.value)}
          placeholder="/root/pull-secret"
          className="flex-1 bg-slate-900 border border-slate-600 rounded px-3 py-1.5 text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:border-ocp-red"
        />
        <span className="text-xs text-slate-500 shrink-0">
          用於存取 registry.redhat.io
        </span>
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
      <SearchPanel catalogTag={catalogTag} pullSecret={pullSecret} onAdded={loadImageset} />

      {/* Catalog 瀏覽器 */}
      <CatalogBrowser catalogTag={catalogTag} pullSecret={pullSecret} onAdded={loadImageset} />

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
