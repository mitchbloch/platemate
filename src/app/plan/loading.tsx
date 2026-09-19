export default function PlanLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-11 w-20 animate-pulse rounded-lg bg-border-light" />
        <div className="h-7 w-40 animate-pulse rounded bg-border-light" />
        <div className="h-11 w-20 animate-pulse rounded-lg bg-border-light" />
      </div>
      <div className="mb-2 h-4 w-24 animate-pulse rounded bg-border-light" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl border border-border bg-border-light" />
        ))}
      </div>
    </div>
  );
}
