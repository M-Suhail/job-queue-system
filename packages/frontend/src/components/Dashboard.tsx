import { useEffect, useState } from 'react'
import { useJobs } from '../hooks/useJobs'
import JobList from './JobList/JobList'
import JobDetails from './JobDetails'
import Controls from './Controls'
import MetricsPanel from './MetricsPanel'
import WorkersPanel from './WorkersPanel'
import JobFilters from './JobList/JobFilters'
import { connectSocket, disconnectSocket } from '../sockets/socket'
import { useQueryClient } from '@tanstack/react-query'
import type { Job } from '../api/types'
import type { JobFilters as JobFiltersType } from '../api/client'

type Tab = 'all' | 'dead_letter' | 'workers'
const PAGE_SIZE = 20

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const [filters, setFilters] = useState<JobFiltersType>({ limit: PAGE_SIZE })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cursors, setCursors] = useState<string[]>([]) // Stack of cursors for back navigation
  const qc = useQueryClient()

  // Apply dead_letter filter when on that tab
  const effectiveFilters = activeTab === 'dead_letter' 
    ? { ...filters, status: 'dead_letter' }
    : filters

  const { data, refetch, isLoading } = useJobs(effectiveFilters)
  
  const jobs = data?.data ?? []
  const pagination = data?.pagination
  const hasNextPage = pagination?.hasMore ?? false
  const hasPrevPage = cursors.length > 0

  useEffect(() => {
    connectSocket(import.meta.env.VITE_API_URL as string | undefined, qc)
    return () => {
      disconnectSocket()
    }
  }, [qc])

  const handleFilterChange = (newFilters: Record<string, string>) => {
    setFilters(prev => ({
      ...prev,
      cursor: undefined, // Reset to first page on filter change
      status: newFilters.status === '' ? undefined : (newFilters.status ?? prev.status),
      q: newFilters.q === '' ? undefined : (newFilters.q ?? prev.q),
      created_after: newFilters.created_after === '' ? undefined : (newFilters.created_after ?? prev.created_after),
      created_before: newFilters.created_before === '' ? undefined : (newFilters.created_before ?? prev.created_before),
      min_attempts: newFilters.min_attempts === '' ? undefined : (newFilters.min_attempts ? parseInt(newFilters.min_attempts) : prev.min_attempts),
      max_attempts: newFilters.max_attempts === '' ? undefined : (newFilters.max_attempts ? parseInt(newFilters.max_attempts) : prev.max_attempts),
    }))
    setCursors([]) // Clear cursor history
  }

  const handleNextPage = () => {
    if (pagination?.nextCursor) {
      // Save current cursor to history
      setCursors(prev => [...prev, filters.cursor || ''])
      setFilters(prev => ({
        ...prev,
        cursor: pagination.nextCursor!
      }))
    }
  }

  const handlePrevPage = () => {
    if (cursors.length > 0) {
      // Pop the last cursor from history
      const newCursors = [...cursors]
      const prevCursor = newCursors.pop()!
      setCursors(newCursors)
      setFilters(prev => ({
        ...prev,
        cursor: prevCursor || undefined
      }))
    }
  }

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab)
    setFilters({ limit: PAGE_SIZE })
    setCursors([])
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <section className="col-span-2">
        {/* Tabs */}
        <div className="flex border-b mb-4">
          <button
            onClick={() => handleTabChange('all')}
            className={`px-4 py-2 font-medium cursor-pointer ${activeTab === 'all' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            All Jobs
          </button>
          <button
            onClick={() => handleTabChange('dead_letter')}
            className={`px-4 py-2 font-medium cursor-pointer ${activeTab === 'dead_letter' ? 'border-b-2 border-red-600 text-red-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Dead Letter
          </button>
          <button
            onClick={() => handleTabChange('workers')}
            className={`px-4 py-2 font-medium cursor-pointer ${activeTab === 'workers' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Workers
          </button>
        </div>

        {/* Workers Tab Content */}
        {activeTab === 'workers' ? (
          <WorkersPanel />
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium">
                {activeTab === 'all' ? 'Recent jobs' : 'Dead Letter Queue'}
                {pagination?.total && <span className="text-sm text-slate-500 ml-2">({pagination.total} total)</span>}
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
              {/* Cursor-based pagination controls */}
              {(hasPrevPage || hasNextPage) && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <button
                    onClick={handlePrevPage}
                    disabled={!hasPrevPage || isLoading}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-600">
                    Page {cursors.length + 1}
                  </span>
                  <button
                    onClick={handleNextPage}
                    disabled={!hasNextPage || isLoading}
                    className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </>
        )}
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
