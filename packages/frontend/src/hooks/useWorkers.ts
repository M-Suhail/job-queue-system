import { useQuery } from '@tanstack/react-query'
import { fetchWorkers } from '../api/client'

export function useWorkers() {
  return useQuery({
    queryKey: ['workers'],
    queryFn: fetchWorkers,
    refetchInterval: 5000, // Refresh every 5 seconds to keep worker status updated
  })
}
