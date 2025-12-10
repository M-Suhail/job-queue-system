export default function JobFilters({ onChange }: { onChange?: (filters: Record<string, string>) => void }) {
  return (
    <div className="flex gap-2 items-center">
      <input className="px-2 py-1 border rounded" placeholder="Search by id or type" onChange={(e) => onChange?.({ q: e.target.value })} />
      <select className="px-2 py-1 border rounded cursor-pointer" onChange={(e) => onChange?.({ status: e.target.value })}>
        <option value="">All</option>
        <option value="pending">Pending</option>
        <option value="in_progress">In progress</option>
        <option value="succeeded">Succeeded</option>
        <option value="failed">Failed</option>
        <option value="dead_letter">Dead letter</option>
      </select>
    </div>
  )
}
