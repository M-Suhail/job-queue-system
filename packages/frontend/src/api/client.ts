import axios from 'axios'
import type { Job } from './types'

const base = (import.meta.env.VITE_API_URL as string) || '/api'
export const api = axios.create({ baseURL: base, timeout: 5000 })

export interface JobFilters {
  limit?: number
  status?: string
  q?: string
}

export async function fetchJobs(filters: JobFilters = {}): Promise<Job[]> {
  const params = new URLSearchParams()
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.status) params.set('status', filters.status)
  if (filters.q) params.set('q', filters.q)
  
  const resp = await api.get<Job[]>(`/jobs?${params.toString()}`)
  return resp.data
}

export async function fetchJob(id: string): Promise<Job> {
  const resp = await api.get<Job>(`/jobs/${id}`)
  return resp.data
}

export async function createJob(payload: { type: string; payload?: any; idempotencyKey?: string }) {
  const resp = await api.post('/jobs', payload)
  return resp.data
}

export async function cancelJob(id: string) {
  const resp = await api.post(`/jobs/${id}/cancel`)
  return resp.data
}

export async function pauseQueue() {
  await api.post('/control/pause')
}
export async function resumeQueue() {
  await api.post('/control/resume')
}

