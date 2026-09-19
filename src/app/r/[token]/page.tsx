import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import RecipeContent from "@/components/RecipeContent";
import SaveSharedRecipe from "@/components/SaveSharedRecipe";
import { getSharedRecipe } from "@/lib/recipeShares";
import { recipeIdInActiveHousehold } from "@/lib/recipes";
import { getUser } from "@/lib/supabase/auth";
import { CUISINE_LABELS } from "@/lib/types";

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
  const viewer = user ? { ownedRecipeId: await recipeIdInActiveHousehold(shared.recipeId) } : null;

  const r = shared.recipe;

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
          <RecipeContent recipe={r} />
        </article>
      </main>

      <SaveSharedRecipe token={token} viewer={viewer} />
    </>
  );
}
