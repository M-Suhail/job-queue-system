import axios from 'axios'
import type { Job, WorkersResponse } from './types'

const base = (import.meta.env.VITE_API_URL as string) || '/api'
export const api = axios.create({ baseURL: base, timeout: 5000 })

export interface JobFilters {
  limit?: number
  cursor?: string
  status?: string
  q?: string
  created_after?: string
  created_before?: string
  min_attempts?: number
  max_attempts?: number
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    total?: number
    limit: number
    hasMore: boolean
    nextCursor?: string | null
  }
}

export async function fetchJobs(filters: JobFilters = {}): Promise<PaginatedResponse<Job>> {
  const params = new URLSearchParams()
  if (filters.limit) params.set('limit', String(filters.limit))
  if (filters.cursor) params.set('cursor', filters.cursor)
  if (filters.status) params.set('status', filters.status)
  if (filters.q) params.set('q', filters.q)
  if (filters.created_after) params.set('created_after', filters.created_after)
  if (filters.created_before) params.set('created_before', filters.created_before)
  if (filters.min_attempts !== undefined) params.set('min_attempts', String(filters.min_attempts))
  if (filters.max_attempts !== undefined) params.set('max_attempts', String(filters.max_attempts))
  
  const resp = await api.get<PaginatedResponse<Job>>(`/jobs?${params.toString()}`)
  return resp.data
}

export async function fetchJob(id: string): Promise<Job> {
  const resp = await api.get<Job>(`/jobs/${id}`)
  return resp.data
}

export async function createJob(payload: { 
  type: string; 
  payload?: any; 
  idempotencyKey?: string;
  priority?: number;
  timeout?: number;
}) {
  const resp = await api.post('/jobs', payload)
  return resp.data
}

export async function cancelJob(id: string) {
  const resp = await api.post(`/jobs/${id}/cancel`)
  return resp.data
}

export async function retryJob(id: string) {
  const resp = await api.post(`/jobs/${id}/retry`)
  return resp.data
}

export async function deleteJob(id: string) {
  const resp = await api.delete(`/jobs/${id}`)
  return resp.data
}

export async function pauseQueue() {
  await api.post('/control/pause')
}
export async function resumeQueue() {
  await api.post('/control/resume')
}

export async function fetchWorkers(): Promise<WorkersResponse> {
  const resp = await api.get<WorkersResponse>('/workers')
  return resp.data
}

