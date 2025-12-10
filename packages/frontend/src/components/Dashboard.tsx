import { useEffect, useState } from 'react'
import { useJobs } from '../hooks/useJobs'
import JobList from './JobList/JobList'
import JobDetails from './JobDetails'
import Controls from './Controls'
import MetricsPanel from './MetricsPanel'
import JobFilters from './JobList/JobFilters'
import { connectSocket, disconnectSocket } from '../sockets/socket'
import { useQueryClient } from '@tanstack/react-query'
import type { Job } from '../api/types'
import type { JobFilters as JobFiltersType } from '../api/client'

type Tab = 'all' | 'dead_letter'

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [filters, setFilters] = useState<JobFiltersType>({ limit: 50 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const qc = useQueryClient()

  // Apply dead_letter filter when on that tab
  const effectiveFilters = activeTab === 'dead_letter' 
    ? { ...filters, status: 'dead_letter' }
    : filters

  const { data: jobs = [], refetch, isLoading } = useJobs(effectiveFilters)

  useEffect(() => {
    connectSocket(import.meta.env.VITE_API_URL as string | undefined, qc)
    return () => {
      disconnectSocket()
    }
  }, [qc])

  const handleFilterChange = (newFilters: Record<string, string>) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      // Clear status filter if empty string
      status: newFilters.status === '' ? undefined : (newFilters.status ?? prev.status),
      q: newFilters.q === '' ? undefined : (newFilters.q ?? prev.q),
    }))
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <section className="col-span-2">
        {/* Tabs */}
        <div className="flex border-b mb-4">
          <button
            onClick={() => { setActiveTab('all'); setFilters({ limit: 50 }); }}
            className={`px-4 py-2 font-medium cursor-pointer ${activeTab === 'all' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            All Jobs
          </button>
          <button
            onClick={() => { setActiveTab('dead_letter'); setFilters({ limit: 50 }); }}
            className={`px-4 py-2 font-medium cursor-pointer ${activeTab === 'dead_letter' ? 'border-b-2 border-red-600 text-red-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Dead Letter
          </button>
        </div>

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">
            {activeTab === 'all' ? 'Recent jobs' : 'Dead Letter Queue'}
          </h2>
          <div className="flex items-center gap-3">
            <button onClick={() => refetch()} className="px-3 py-1 bg-white border rounded hover:bg-slate-50 cursor-pointer">
              {isLoading ? 'Loading...' : 'Refresh'}
            </button>
            <Controls />
          </div>
        </div>

        {/* Filters - only show on All Jobs tab */}
        {activeTab === 'all' && (
          <div className="mb-4">
            <JobFilters onChange={handleFilterChange} />
          </div>
        )}

        <div className="bg-white rounded shadow overflow-hidden">
          <JobList jobs={jobs as Job[]} onSelect={(id) => setSelectedId(id)} />
        </div>
      </section>

      <aside className="col-span-1">
        <div className="bg-white p-4 rounded shadow">
          <h3 className="font-medium mb-2">Job details</h3>
          <JobDetails jobId={selectedId} />
        </div>

        <div className="mt-4">
          <MetricsPanel />
        </div>
      </aside>
    </div>
  )
}
