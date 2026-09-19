export default function GenerateLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-2 h-8 w-56 animate-pulse rounded bg-border-light" />
      <div className="mb-6 h-4 w-80 max-w-full animate-pulse rounded bg-border-light" />
      <div className="mb-4 h-11 w-32 animate-pulse rounded-lg bg-border-light" />
      <div className="h-64 animate-pulse rounded-2xl border border-border bg-border-light" />
    </div>
  );
}
