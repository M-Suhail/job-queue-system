export default function Header() {
  return (
    <header className="bg-white shadow">
      <div className="max-w-7xl mx-auto py-4 px-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Job Queue Dashboard</h1>
          <div className="text-sm text-slate-500">Real-time job processing overview</div>
        </div>
      </div>
    </header>
  )
}
