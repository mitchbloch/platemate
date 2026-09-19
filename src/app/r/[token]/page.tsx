import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import NutritionBadge from "@/components/NutritionBadge";
import SaveSharedRecipe from "@/components/SaveSharedRecipe";
import { getSharedRecipe } from "@/lib/recipeShares";
import { getRecipe } from "@/lib/recipes";
import { getUser } from "@/lib/supabase/auth";
import { CUISINE_LABELS, DIETARY_FLAG_LABELS, MEAL_TYPE_LABELS } from "@/lib/types";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { token } = await params;
  const shared = await getSharedRecipe(token);
  if (!shared) return { title: "Recipe not found · Platemate" };
  const { recipe } = shared;
  const description = recipe.description ?? `${CUISINE_LABELS[recipe.cuisine]} · ${recipe.servings} servings · shared from Platemate`;
  return {
    title: `${recipe.title} · Platemate`,
    description,
    openGraph: {
      title: recipe.title,
      description,
      type: "article",
      siteName: "Platemate",
      ...(recipe.imageUrl ? { images: [{ url: recipe.imageUrl }] } : {}),
    },
    twitter: { card: recipe.imageUrl ? "summary_large_image" : "summary" },
    robots: { index: false },
  };
}

export default async function SharedRecipePage({ params }: Params) {
  const { token } = await params;
  const shared = await getSharedRecipe(token); // memoized: same call as generateMetadata
  if (!shared) notFound();

  // Signed in? Then find out whether this recipe is already theirs.
  const user = await getUser();
  const viewer = user ? { ownedRecipeId: (await getRecipe(shared.recipeId))?.id ?? null } : null;

  const r = shared.recipe;
  const totalTime = r.totalTimeMinutes ?? 0;

  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" className="font-display text-xl font-semibold tracking-tight text-primary">Platemate</Link>
          <span className="text-xs text-text-muted">
            {shared.sharedBy ? `Shared by ${shared.sharedBy}` : "Shared recipe"}
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 pb-32">
        <article className="animate-fade-in">
          <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight text-text">{r.title}</h1>
          {r.description && <p className="mb-3 text-text-secondary">{r.description}</p>}
          <div className="mb-6 flex flex-wrap gap-2 text-sm text-text-muted">
            {r.sourceName && <span>{r.sourceName}</span>}
            <span className="rounded-md bg-accent-light px-2 py-0.5 text-accent">{CUISINE_LABELS[r.cuisine]}</span>
            <span className="rounded-md bg-border-light px-2 py-0.5 text-text-secondary">{MEAL_TYPE_LABELS[r.mealType]}</span>
            {r.isSlowCooker && <span className="rounded-md bg-gold-light px-2 py-0.5 text-gold">Slow Cooker</span>}
            {totalTime > 0 && <span>{totalTime} min</span>}
            <span>{r.servings} servings</span>
            {r.dietaryFlags.map((flag) => (
              <span key={flag} className="rounded-md bg-accent-light px-2 py-0.5 text-accent">{DIETARY_FLAG_LABELS[flag]}</span>
            ))}
          </div>

          {r.nutrition && (
            <div className="mb-8">
              <NutritionBadge nutrition={r.nutrition} />
            </div>
          )}

          <section className="mb-8">
            <h2 className="mb-3 font-display text-lg font-semibold text-text">Ingredients</h2>
            <ul className="space-y-1.5">
              {r.ingredients.map((ing, i) => (
                <li key={i} className="text-text-secondary">
                  <span className="font-medium text-text">
                    {ing.quantity !== null && `${ing.quantity} `}
                    {ing.unit && `${ing.unit} `}
                  </span>
                  {ing.name}
                  {ing.preparation && <span className="text-text-muted">, {ing.preparation}</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="mb-3 font-display text-lg font-semibold text-text">Instructions</h2>
            <ol className="list-decimal space-y-3 pl-5">
              {r.instructions.map((step, i) => (
                <li key={i} className="leading-relaxed text-text-secondary">{step}</li>
              ))}
            </ol>
          </section>

          {r.sourceUrl && (
            <div className="border-t border-border pt-4">
              <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary transition-colors hover:text-primary-dark">
                View original recipe &rarr;
              </a>
            </div>
          )}
        </article>
      </main>

      <SaveSharedRecipe token={token} viewer={viewer} />
    </>
  );
}
