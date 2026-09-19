"use client";

/** Search box shared by the recipe library and the plan picker. */
export default function RecipeSearchInput({
  value,
  onChange,
  resultCount,
  totalCount,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  resultCount: number;
  totalCount: number;
  autoFocus?: boolean;
}) {
  return (
    <div className="relative">
      <svg
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
      >
        <path
          fillRule="evenodd"
          d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
          clipRule="evenodd"
        />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search recipes, cuisines, ingredients…"
        aria-label="Search recipes"
        autoFocus={autoFocus}
        enterKeyHint="search"
        autoComplete="off"
        className="min-h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-24 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
      />
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted" aria-live="polite">
        {value ? `${resultCount} of ${totalCount}` : `${totalCount} recipes`}
      </div>
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-20 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-text-muted hover:bg-border-light hover:text-text"
        >
          &times;
        </button>
      )}
    </div>
  );
}
