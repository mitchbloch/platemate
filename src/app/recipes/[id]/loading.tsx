export default function RecipeDetailLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4 h-4 w-24 animate-pulse rounded bg-border-light" />
      <div className="mb-2 h-10 w-3/4 animate-pulse rounded bg-border-light" />
      <div className="mb-6 h-5 w-1/2 animate-pulse rounded bg-border-light" />
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-4 animate-pulse rounded bg-border-light"
            style={{ width: `${60 + (i * 13) % 30}%` }}
          />
        ))}
      </div>
    </div>
  );
}
