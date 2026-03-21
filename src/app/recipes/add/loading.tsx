export default function AddRecipeLoading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="h-8 w-40 animate-pulse rounded bg-gray-200" />
      <div className="mt-6 space-y-4">
        <div className="h-12 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
    </div>
  );
}
