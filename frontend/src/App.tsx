import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Configuration from './pages/Configuration'
import Phases from './pages/Phases'
import ImagesetManager from './pages/ImagesetManager'
import OperatorDownload from './pages/OperatorDownload'
import { checkHealth } from './api/client'

export default function App() {
  const [backendOnline, setBackendOnline] = useState(false)

  useEffect(() => {
    const check = async () => {
      try {
        await checkHealth()
        setBackendOnline(true)
      } catch {
        setBackendOnline(false)
      }
    }
    check()
    const id = setInterval(check, 10000)
    return () => clearInterval(id)
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout backendOnline={backendOnline} />}>
          <Route index element={<Dashboard />} />
          <Route path="config" element={<Configuration />} />
          <Route path="phases" element={<Phases />} />
          <Route path="imageset" element={<ImagesetManager />} />
          <Route path="operator-download" element={<OperatorDownload />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
