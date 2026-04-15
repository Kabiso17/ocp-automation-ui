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
