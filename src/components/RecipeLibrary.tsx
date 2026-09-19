"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Recipe } from "@/lib/types";
import { matchesRecipeQuery } from "@/lib/recipeSearch";
import RecipeCard from "./RecipeCard";
import RecipeSearchInput from "./RecipeSearchInput";

const URL_DEBOUNCE_MS = 250;

function readUrlQuery(): string {
  return new URLSearchParams(window.location.search).get("q") ?? "";
}

function urlWithQuery(query: string): string {
  const params = new URLSearchParams(window.location.search);
  if (query) params.set("q", query);
  else params.delete("q");
  const qs = params.toString();
  return qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
}

/** The recipe grid with a search box. The query lives in `?q=` so that
 *  going back from a recipe returns to the same filtered view. */
export default function RecipeLibrary({ recipes }: { recipes: Recipe[] }) {
  // Only the initial value comes from the router; after mount the input owns
  // the query and the URL merely mirrors it.
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirror the query into the URL with the native history API: no server
  // round-trip (this page is dynamic, so a router navigation would refetch
  // and re-render on every keystroke), and no echo back into `query` that
  // could overwrite characters typed in the meantime.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (readUrlQuery() !== query) {
        window.history.replaceState(window.history.state, "", urlWithQuery(query));
      }
    }, URL_DEBOUNCE_MS);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query]);

  // Back/forward is the only time the URL should drive the input.
  useEffect(() => {
    function onPopState() {
      setQuery(readUrlQuery());
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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
