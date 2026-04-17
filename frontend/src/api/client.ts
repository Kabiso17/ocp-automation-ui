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
  pull_secret = '/root/pull-secret',
  force_refresh = false,
) =>
  api.post<import('../types').OperatorSearchResult>(
    '/api/imageset/operators/search',
    { operator_name, ocp_version, pull_secret, force_refresh },
    { timeout: 0 },
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

export const listCatalogOperators = (
  ocp_version: string,
  pull_secret = '/root/pull-secret',
  force_refresh = false,
) =>
  api.get<import('../types').CatalogListResult>('/api/operators/catalog', {
    params: { ocp_version, pull_secret, force_refresh },
    timeout: 0,
  })

export const getCacheStats = () =>
  api.get<import('../types').CacheStats>('/api/operators/cache')

export const clearOperatorCache = (ocp_version?: string) =>
  api.delete<{ message: string; deleted: number }>('/api/operators/cache', {
    params: ocp_version ? { ocp_version } : undefined,
  })

// CLI 工具下載
export const getToolsStatus = () =>
  api.get<Record<string, import('../types').ToolStatus>>('/api/tools/status')

export const startToolDownload = (tool: string, ocp_version: string, install_dir: string) =>
  api.post<{ message: string; tool: string; version: string }>(
    '/api/tools/download',
    null,
    { params: { tool, ocp_version, install_dir }, timeout: 0 },
  )

export const resetToolsDownload = () =>
  api.delete<{ message: string }>('/api/tools/download/reset')

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
