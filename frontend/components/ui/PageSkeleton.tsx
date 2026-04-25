// Reusable skeleton loaders for list, detail, and card pages

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {/* header bar */}
      <div className="px-5 py-4 border-b border-gray-50 flex justify-between items-center">
        <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="h-8 w-24 bg-gray-200 rounded-lg animate-pulse" />
      </div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50">
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-4 py-3">
                <div className="h-3 bg-gray-200 rounded animate-pulse" style={{ width: `${50 + (i * 17) % 40}%` }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, r) => (
            <tr key={r} className="border-b border-gray-50">
              {Array.from({ length: cols }).map((_, c) => (
                <td key={c} className="px-4 py-3">
                  <div className="h-4 bg-gray-100 rounded animate-pulse" style={{ width: `${40 + ((r + c) * 13) % 50}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CardGridSkeleton({ cards = 6 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-100 p-5 space-y-3">
          <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
          <div className="h-3 w-1/2 bg-gray-100 rounded animate-pulse" />
          <div className="h-3 w-2/3 bg-gray-100 rounded animate-pulse" />
          <div className="flex gap-2 pt-1">
            <div className="h-6 w-16 bg-gray-100 rounded-full animate-pulse" />
            <div className="h-6 w-20 bg-gray-100 rounded-full animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="space-y-5">
      {/* title row */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 bg-gray-200 rounded-lg animate-pulse" />
        <div className="space-y-1.5">
          <div className="h-6 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-3 w-32 bg-gray-100 rounded animate-pulse" />
        </div>
      </div>
      {/* stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 space-y-2">
            <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
            <div className="h-7 w-28 bg-gray-100 rounded animate-pulse" />
          </div>
        ))}
      </div>
      {/* main card */}
      <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
        <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <div className="h-3 w-20 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function FormSkeleton({ fields = 8 }: { fields?: number }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6">
      <div className="h-4 w-40 bg-gray-200 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-2 gap-6">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
            <div className="h-10 w-full bg-gray-100 rounded-xl animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
