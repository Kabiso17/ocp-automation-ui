import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Download, ArrowDown } from 'lucide-react'
import type { PhaseKey } from '../types'

interface LogViewerProps {
  phase: PhaseKey | null
  phaseLabel: string
  onClose: () => void
}

export default function LogViewer({ phase, phaseLabel, onClose }: LogViewerProps) {
  const [lines, setLines] = useState<string[]>([])
  const [autoScroll, setAutoScroll] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const esRef = useRef<EventSource | null>(null)

  const startStream = useCallback(() => {
    if (!phase) return
    setLines([])
    esRef.current?.close()

    const es = new EventSource(`/api/phases/${phase}/logs`)
    esRef.current = es

    es.onmessage = (e) => {
      const data = e.data
      if (data === '[STREAM_END]') {
        es.close()
        return
      }
      setLines((prev) => [...prev, data])
    }

    es.onerror = () => {
      es.close()
    }
  }, [phase])

  useEffect(() => {
    startStream()
    return () => esRef.current?.close()
  }, [startStream])

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [lines, autoScroll])

  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setAutoScroll(nearBottom)
  }

  const downloadLog = () => {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${phase}-${Date.now()}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Strip ANSI escape codes for cleaner display
  const stripAnsi = (str: string) =>
    str.replace(/\x1B\[[0-9;]*[mGKHF]/g, '')

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-5xl h-[80vh] bg-slate-900 rounded-xl border border-slate-700 flex flex-col shadow-2xl">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="ml-2 text-slate-300 text-sm font-mono">{phaseLabel} — Log</span>
            <span className="text-slate-500 text-xs ml-2">{lines.length} 行</span>
          </div>
          <div className="flex items-center gap-2">
            {!autoScroll && (
              <button
                onClick={() => {
                  setAutoScroll(true)
                  bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800"
              >
                <ArrowDown size={12} /> 捲到底部
              </button>
            )}
            <button
              onClick={downloadLog}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800"
            >
              <Download size={12} /> 下載
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Log content */}
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed"
        >
          {lines.length === 0 ? (
            <div className="text-slate-600 italic">等待 log 輸出...</div>
          ) : (
            lines.map((line, i) => {
              const clean = stripAnsi(line)
              let color = 'text-slate-300'
              if (/ERROR|FAILED|fatal/i.test(clean)) color = 'text-red-400'
              else if (/WARNING|WARN/i.test(clean)) color = 'text-yellow-400'
              else if (/ok:|changed:|INFO/i.test(clean)) color = 'text-green-400'
              else if (/PLAY|TASK/i.test(clean)) color = 'text-blue-300 font-semibold'
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
    </div>
  )
}
