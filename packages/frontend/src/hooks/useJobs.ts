import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchJobs, type JobFilters } from '../api/client'
import type { Job } from '../api/types'

export function useJobs(filters: JobFilters = { limit: 50 }) {
  const qc = useQueryClient()
  const q = useQuery<Job[], Error>({
    queryKey: ['jobs', filters],
    queryFn: () => fetchJobs(filters),
    staleTime: 5000
  })
  return { ...q, qc }
}
