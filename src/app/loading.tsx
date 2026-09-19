export default function HomeLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <div className="mb-3 h-10 w-72 max-w-full animate-pulse rounded bg-border-light" />
      <div className="mb-10 h-6 w-96 max-w-full animate-pulse rounded bg-border-light" />
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-2xl border border-border bg-border-light" />
        ))}
      </div>
    </div>
  );
}
