export default function GroceryLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="h-11 w-20 animate-pulse rounded-lg bg-border-light" />
        <div className="h-7 w-40 animate-pulse rounded bg-border-light" />
        <div className="h-11 w-20 animate-pulse rounded-lg bg-border-light" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i}>
            <div className="mb-2 h-4 w-20 animate-pulse rounded bg-border-light" />
            <div className="space-y-2 rounded-2xl border border-border bg-surface p-3">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-9 animate-pulse rounded-xl bg-border-light" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
