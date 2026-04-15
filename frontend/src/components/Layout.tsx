import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'

interface LayoutProps {
  backendOnline: boolean
}

export default function Layout({ backendOnline }: LayoutProps) {
  return (
    <div className="flex min-h-screen bg-slate-950">
      <Sidebar backendOnline={backendOnline} />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
