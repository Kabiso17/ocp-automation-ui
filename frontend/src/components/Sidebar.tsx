import { NavLink } from 'react-router-dom'
import { LayoutDashboard, Settings, Play, Server, Package } from 'lucide-react'

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/config', label: '配置', icon: Settings },
  { to: '/phases', label: '執行', icon: Play },
  { to: '/imageset', label: 'ImageSet', icon: Package },
]

interface SidebarProps {
  backendOnline: boolean
}

export default function Sidebar({ backendOnline }: SidebarProps) {
  return (
    <aside className="w-56 bg-slate-900 border-r border-slate-700 flex flex-col min-h-screen">
      {/* Logo */}
      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-ocp-red rounded flex items-center justify-center">
            <Server size={16} className="text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm">OCP Automation</div>
            <div className="text-slate-400 text-xs">管理介面</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Backend status */}
      <div className="p-4 border-t border-slate-700">
        <div className="flex items-center gap-2 text-xs">
          <div
            className={`w-2 h-2 rounded-full ${
              backendOnline ? 'bg-green-400 animate-pulse' : 'bg-red-500'
            }`}
          />
          <span className={backendOnline ? 'text-green-400' : 'text-red-400'}>
            {backendOnline ? 'API 已連線' : 'API 無法連線'}
          </span>
        </div>
      </div>
    </aside>
  )
}
