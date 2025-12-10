import type { Job } from '../../api/types'
import clsx from 'clsx'

function StatusPill({ status }: { status?: string }) {
  const map: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800',
    in_progress: 'bg-blue-100 text-blue-800',
    succeeded: 'bg-green-100 text-green-800',
    failed: 'bg-amber-100 text-amber-800',
    cancelled: 'bg-gray-100 text-gray-800',
    dead_letter: 'bg-red-100 text-red-800'
  }
  return <span className={clsx('px-2 py-0.5 rounded text-sm', map[status ?? ''] || 'bg-slate-100')}>{status}</span>
}

export default function JobRow({ job, onView }: { job: Job; onView: () => void }) {
  return (
    <li className="p-3 border-b flex items-center justify-between hover:bg-slate-50 cursor-pointer">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-12 text-xs text-slate-500">{job.created_at ? new Date(job.created_at).toLocaleTimeString() : ''}</div>
        <div className="min-w-0">
          <div className="font-medium truncate">{job.type}</div>
          <div className="text-sm text-slate-500 truncate">id: {job.id}</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <StatusPill status={job.status} />
        <button onClick={onView} className="text-sm text-blue-600 cursor-pointer hover:text-blue-800">View</button>
      </div>
    </li>
  )
}
