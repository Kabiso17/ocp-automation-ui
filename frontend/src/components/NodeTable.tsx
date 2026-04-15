import type { NodeConfig } from '../types'

interface NodeTableProps {
  label: string
  nodes: NodeConfig[]
  onChange: (nodes: NodeConfig[]) => void
}

export default function NodeTable({ label, nodes, onChange }: NodeTableProps) {
  const handleIpChange = (index: number, ip: string) => {
    const updated = nodes.map((n, i) => (i === index ? { ...n, ip } : n))
    onChange(updated)
  }

  return (
    <div>
      <div className="text-slate-300 text-sm font-medium mb-2">{label}</div>
      <div className="space-y-2">
        {nodes.map((node, i) => (
          <div key={node.name} className="flex items-center gap-3">
            <div className="w-24 text-slate-400 text-sm font-mono">{node.name}</div>
            <input
              type="text"
              value={node.ip}
              onChange={(e) => handleIpChange(i, e.target.value)}
              placeholder="192.168.x.x"
              className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm font-mono placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-ocp-red focus:border-ocp-red"
            />
          </div>
        ))}
      </div>
    </div>
  )
}
