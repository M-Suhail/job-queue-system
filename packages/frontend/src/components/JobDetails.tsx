import { useQueryClient, useQuery } from '@tanstack/react-query'
import { fetchJob, cancelJob } from '../api/client'
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

  if (!jobId) {
    return <div className="text-sm text-slate-500">Select a job to view details</div>
  }
  if (jobQ.isLoading) return <div>Loading...</div>
  if (jobQ.isError) return <div className="text-sm text-red-600">Error loading job</div>

  const job = jobQ.data as Job

  return (
    <div>
      <div className="text-sm text-slate-600 mb-2">ID: {job.id}</div>
      <div className="mb-2">Type: {job.type}</div>
      <div className="mb-2">Status: <strong>{job.status}</strong></div>
      <div className="mb-2">Attempts: {job.attempts}/{job.max_attempts}</div>
      {job.last_error && <div className="mb-2 text-sm text-red-600">Last error: {job.last_error}</div>}
      <div className="mb-2">Payload:</div>
      <pre className="text-xs bg-slate-100 p-2 rounded">{JSON.stringify(job.payload, null, 2)}</pre>
      {(job.status === 'pending' || job.status === 'in_progress') && (
        <div className="flex gap-2 mt-3">
          <button onClick={onCancel} className="px-3 py-1 bg-red-600 text-white rounded cursor-pointer hover:bg-red-700">Cancel</button>
        </div>
      )}
    </div>
  )
}
