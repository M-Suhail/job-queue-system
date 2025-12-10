import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchJobs, type JobFilters, type PaginatedResponse } from '../api/client'
import type { Job } from '../api/types'

export function useJobs(filters: JobFilters = { limit: 20 }) {
  const qc = useQueryClient()
  const q = useQuery<PaginatedResponse<Job>, Error>({
    queryKey: ['jobs', filters],
    queryFn: () => fetchJobs(filters),
    staleTime: 5000
  })
  return { ...q, qc }
}
