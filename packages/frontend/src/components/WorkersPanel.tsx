import { useWorkers } from '../hooks/useWorkers'
import type { Worker } from '../api/types'

function formatUptime(startedAt: string): string {
  const start = new Date(startedAt).getTime()
  const now = Date.now()
  const diff = now - start
  
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

function formatLastSeen(lastHeartbeat: string): string {
  const diff = Date.now() - new Date(lastHeartbeat).getTime()
  const seconds = Math.floor(diff / 1000)
  
  if (seconds < 60) {
    return `${seconds}s ago`
  }
  const minutes = Math.floor(seconds / 60)
  return `${minutes}m ago`
}

function getStatusColor(status: Worker['status']): string {
  switch (status) {
    case 'active':
      return 'bg-green-100 text-green-800'
    case 'idle':
      return 'bg-blue-100 text-blue-800'
    case 'draining':
      return 'bg-yellow-100 text-yellow-800'
    case 'offline':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

function getStatusDot(status: Worker['status']): string {
  switch (status) {
    case 'active':
      return 'bg-green-500'
    case 'idle':
      return 'bg-blue-500'
    case 'draining':
      return 'bg-yellow-500'
    case 'offline':
      return 'bg-red-500'
    default:
      return 'bg-gray-500'
  }
}

export default function WorkersPanel() {
  const { data, isLoading, error, refetch } = useWorkers()
  
  if (isLoading) {
    return (
      <div className="bg-white rounded shadow p-4">
        <h3 className="font-medium mb-4">Worker Fleet</h3>
        <p className="text-slate-500 text-sm">Loading workers...</p>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="bg-white rounded shadow p-4">
        <h3 className="font-medium mb-4">Worker Fleet</h3>
        <p className="text-red-500 text-sm">Failed to load workers</p>
      </div>
    )
  }
  
  const workers = data?.workers ?? []
  const active = data?.active ?? 0
  const total = data?.total ?? 0
  
  return (
    <div className="bg-white rounded shadow">
      <div className="p-4 border-b flex items-center justify-between">
        <div>
          <h3 className="font-medium">Worker Fleet</h3>
          <p className="text-sm text-slate-500 mt-1">
            {active} active / {total} total
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1 text-sm bg-white border rounded hover:bg-slate-50 cursor-pointer"
        >
          Refresh
        </button>
      </div>
      
      {workers.length === 0 ? (
        <div className="p-8 text-center text-slate-500">
          <p>No workers registered</p>
          <p className="text-sm mt-1">Start a worker to see it here</p>
        </div>
      ) : (
        <div className="divide-y">
          {workers.map((worker) => (
            <div key={worker.id} className="p-4 hover:bg-slate-50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${getStatusDot(worker.status)}`} />
                  <span className="font-medium text-sm truncate max-w-[200px]" title={worker.id}>
                    {worker.hostname}:{worker.pid}
                  </span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${getStatusColor(worker.status)}`}>
                  {worker.status}
                </span>
              </div>
              
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>
                  <span className="text-slate-400">Concurrency:</span> {worker.concurrency}
                </div>
                <div>
                  <span className="text-slate-400">Uptime:</span> {formatUptime(worker.started_at)}
                </div>
                <div>
                  <span className="text-slate-400">Processed:</span>{' '}
                  <span className="text-green-600">{worker.jobs_processed}</span>
                </div>
                <div>
                  <span className="text-slate-400">Failed:</span>{' '}
                  <span className="text-red-600">{worker.jobs_failed}</span>
                </div>
              </div>
              
              <div className="mt-2 text-xs text-slate-400">
                Last seen: {formatLastSeen(worker.last_heartbeat)}
                {worker.current_job_id && (
                  <span className="ml-2 text-blue-600" title={worker.current_job_id}>
                    • Working on job
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
