import type { Job } from '../../api/types'
import JobRow from './JobRow'

export default function JobList({ jobs, onSelect }: { jobs: Job[]; onSelect: (id: string) => void }) {
  if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
    return <div className="p-6 text-sm text-slate-500">No jobs found</div>
  }
  return (
    <ul>
      {jobs.map((job) => (
        <JobRow key={job.id} job={job} onView={() => onSelect(job.id)} />
      ))}
    </ul>
  )
}
