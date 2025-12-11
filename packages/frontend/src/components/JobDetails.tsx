import { useQueryClient, useQuery } from '@tanstack/react-query'
import { fetchJob, cancelJob, retryJob, deleteJob } from '../api/client'
import type { Job } from '../api/types'

export default function JobDetails({ jobId }: { jobId: string | null }) {
  const qc = useQueryClient()
  const jobQ = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => (jobId ? fetchJob(jobId) : Promise.resolve(null)),
    enabled: !!jobId
  })

  async function onCancel() {
    if (!jobId) return
    await cancelJob(jobId)
    qc.invalidateQueries({ queryKey: ['jobs'] })
    qc.invalidateQueries({ queryKey: ['job', jobId] })
  }

  async function onRetry() {
    if (!jobId) return
    await retryJob(jobId)
    qc.invalidateQueries({ queryKey: ['jobs'] })
    qc.invalidateQueries({ queryKey: ['job', jobId] })
  }

  async function onDelete() {
    if (!jobId) return
    if (!confirm('Are you sure you want to permanently delete this job?')) return
    await deleteJob(jobId)
    qc.invalidateQueries({ queryKey: ['jobs'] })
    // Clear job detail since it's deleted
    qc.setQueryData(['job', jobId], null)
  }

  if (!jobId) {
    return <div className="text-sm text-slate-500">Select a job to view details</div>
  }
  if (jobQ.isLoading) return <div>Loading...</div>
  if (jobQ.isError) return <div className="text-sm text-red-600">Error loading job</div>

  const job = jobQ.data as Job

  const canCancel = job.status === 'pending' || job.status === 'failed'
  const canRetry = job.status === 'dead_letter' || job.status === 'failed' || job.status === 'cancelled'
  const canDelete = job.status !== 'in_progress'

  return (
    <div>
      <div className="text-sm text-slate-600 mb-2">ID: {job.id}</div>
      <div className="mb-2">Type: {job.type}</div>
      <div className="mb-2">Status: <strong>{job.status}</strong></div>
      <div className="mb-2">Attempts: {job.attempts}/{job.max_attempts}</div>
      <div className="mb-2">Priority: {job.priority ?? 5}</div>
      {job.timeout_ms && <div className="mb-2">Timeout: {job.timeout_ms}ms</div>}
      {job.last_error && <div className="mb-2 text-sm text-red-600">Last error: {job.last_error}</div>}
      <div className="mb-2">Payload:</div>
      <pre className="text-xs bg-slate-100 p-2 rounded overflow-auto max-h-40">{JSON.stringify(job.payload, null, 2)}</pre>
      
      <div className="flex gap-2 mt-3 flex-wrap">
        {canCancel && (
          <button onClick={onCancel} className="px-3 py-1 bg-yellow-600 text-white rounded cursor-pointer hover:bg-yellow-700">
            Cancel
          </button>
        )}
        {canRetry && (
          <button onClick={onRetry} className="px-3 py-1 bg-green-600 text-white rounded cursor-pointer hover:bg-green-700">
            Retry
          </button>
        )}
        {canDelete && (
          <button onClick={onDelete} className="px-3 py-1 bg-red-600 text-white rounded cursor-pointer hover:bg-red-700">
            Delete
          </button>
        )}
      </div>
    </div>
  )
}
