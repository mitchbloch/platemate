import { Suspense } from "react";
import Link from "next/link";
import Nav from "@/components/Nav";
import RecipeGenerator from "@/components/RecipeGenerator";
import { getGeneration, listActiveGenerations } from "@/lib/recipeGenerations";

export const dynamic = "force-dynamic";

export default async function GenerateRecipePage({ searchParams }: { searchParams: Promise<{ g?: string }> }) {
  const { g } = await searchParams;
  const [drafts, initial] = await Promise.all([listActiveGenerations(), g ? getGeneration(g) : Promise.resolve(null)]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-text">Generate a recipe</h1>
            <p className="text-sm text-text-muted">Describe a meal or photograph your ingredients. Nutrition-aware, and it knows your library.</p>
          </div>
          <Link href="/recipes/add" className="shrink-0 text-sm text-text-muted hover:text-text-secondary">Import instead</Link>
        </div>
        {/* useSearchParams in the child needs a Suspense boundary */}
        <Suspense>
          <RecipeGenerator drafts={drafts} initial={initial} />
        </Suspense>
      </main>
    </>
  );
}
