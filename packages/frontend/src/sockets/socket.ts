import { io, type Socket } from 'socket.io-client'
import type { QueryClient } from '@tanstack/react-query'
import type { Job } from '../api/types'

let socket: Socket | null = null

export function connectSocket(baseUrl: string | undefined, qc: QueryClient) {
  if (socket) return socket
  socket = baseUrl ? io(baseUrl) : io()
  socket.on('job_created', (job: Job) => {
    try {
      qc.setQueryData(['jobs'], (old: Job[] | undefined) => [job, ...(old || [])].slice(0, 100))
    } catch (e) {
      console.error('socket job_created', e)
    }
  })
  socket.on('job_updated', (job: Job) => {
    try {
      qc.setQueryData(['jobs'], (old: Job[] | undefined) => (old || []).map((j) => (j.id === job.id ? job : j)))
      qc.invalidateQueries({ queryKey: ['job', job.id] })
    } catch (e) {
      console.error('socket job_updated', e)
    }
  })
  socket.on('job_deleted', (payload: { jobId: string }) => {
    try {
      qc.setQueryData(['jobs'], (old: Job[] | undefined) => (old || []).filter((j) => j.id !== payload.jobId))
      qc.removeQueries({ queryKey: ['job', payload.jobId] })
    } catch (e) {
      console.error('socket job_deleted', e)
    }
  })
  socket.on('queue_paused', (payload: { paused: boolean }) => {
    qc.setQueryData(['queue', 'paused'], payload.paused)
  })
  socket.on('queue_resumed', (payload: { paused: boolean }) => {
    qc.setQueryData(['queue', 'paused'], payload.paused)
  })
  return socket
}

export function disconnectSocket() {
  if (!socket) return
  socket.disconnect()
  socket = null
}

