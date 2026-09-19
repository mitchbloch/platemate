"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Recipe } from "@/lib/types";
import { matchesRecipeQuery } from "@/lib/recipeSearch";
import RecipeCard from "./RecipeCard";
import RecipeSearchInput from "./RecipeSearchInput";

const URL_DEBOUNCE_MS = 250;

/** The recipe grid with a search box. The query lives in `?q=` so that
 *  going back from a recipe returns to the same filtered view. */
export default function RecipeLibrary({ recipes }: { recipes: Recipe[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Back/forward changes the URL underneath us: adopt its query. Tracked as
  // "previous prop" state so a change is applied exactly once, during render,
  // without an effect (the writes we make ourselves land here as no-ops).
  const [seenUrlQuery, setSeenUrlQuery] = useState(urlQuery);
  if (urlQuery !== seenUrlQuery) {
    setSeenUrlQuery(urlQuery);
    setQuery(urlQuery);
  }

  // Mirror the query into the URL, debounced so typing doesn't spam history
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const current = searchParams.get("q") ?? "";
      if (current === query) return;
      const params = new URLSearchParams(searchParams.toString());
      if (query) params.set("q", query);
      else params.delete("q");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }, URL_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, pathname, router, searchParams]);

  const visible = useMemo(() => recipes.filter((r) => matchesRecipeQuery(r, query)), [recipes, query]);

  return (
    <div>
      <div className="mb-4">
        <RecipeSearchInput value={query} onChange={setQuery} resultCount={visible.length} totalCount={recipes.length} />
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-border p-12 text-center">
          <p className="mb-2 text-text-secondary">No recipes match &ldquo;{query}&rdquo;.</p>
          <button
            type="button"
            onClick={() => setQuery("")}
            className="min-h-11 text-sm font-medium text-primary hover:text-primary-dark"
          >
            Show all recipes
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}
    </div>
  );
}
