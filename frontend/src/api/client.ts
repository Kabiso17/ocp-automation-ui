import axios from 'axios'
import type { SiteConfig, PhaseStatus, ValidationResult } from '../types'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '',
  timeout: 10000,
})

// Config
export const getConfig = () => api.get<SiteConfig>('/api/config')
export const saveConfig = (config: SiteConfig) => api.post<{ message: string }>('/api/config', config)
export const validateConfig = () => api.get<ValidationResult>('/api/config/validate')

// Phases
export const getPhaseStatuses = () =>
  api.get<Record<string, PhaseStatus>>('/api/phases/status')

export const triggerPhase = (phase: string) =>
  api.post<{ message: string; phase: string }>(`/api/phases/${phase}`)

export const resetPhase = (phase: string) =>
  api.delete<{ message: string }>(`/api/phases/${phase}/reset`)

// Health
export const checkHealth = () => api.get<{ status: string }>('/api/health')

// ImageSet
export const getImageset = () =>
  api.get<import('../types').ImagesetConfig>('/api/imageset')

export const searchOperator = (
  operator_name: string,
  ocp_version: string,
  image_timeout: string,
) =>
  api.post<import('../types').OperatorSearchResult>(
    '/api/imageset/operators/search',
    { operator_name, ocp_version, image_timeout },
    { timeout: 0 },  // 無限等待，oc-mirror 可能很慢
  )

export const addOperator = (
  operator_name: string,
  channel: string,
  version: string,
  catalog_tag: string = 'v4.20',
) =>
  api.post<{ message: string }>('/api/imageset/operators/add', {
    operator_name,
    channel,
    version,
    catalog_tag,
  })

export const removeOperator = (operator_name: string, catalog_tag: string = 'v4.20') =>
  api.delete<{ message: string }>(
    `/api/imageset/operators/${encodeURIComponent(operator_name)}`,
    { params: { catalog_tag } },
  )

export const exportImagesetYaml = () =>
  api.get<{ yaml: string }>('/api/imageset/export')

// Mirror (oc-mirror 下載)
export const getMirrorStatus = () =>
  api.get<import('../types').MirrorStatus>('/api/mirror/status')

export const startMirrorDownload = (destination: string, workspace: string = '/tmp/oc-mirror-workspace') =>
  api.post<{ message: string; destination: string }>(
    '/api/mirror/run',
    { destination, workspace },
    { timeout: 0 },
  )

export const resetMirror = () =>
  api.delete<{ message: string }>('/api/mirror/reset')
