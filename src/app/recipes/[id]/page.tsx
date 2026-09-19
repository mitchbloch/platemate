import Nav from "@/components/Nav";
import RecipeDetail from "@/components/RecipeDetail";
import { getRecipe } from "@/lib/recipes";
import { notFound } from "next/navigation";
import { backLinkFor } from "@/lib/navigation";
import { getActiveShare, sharePath } from "@/lib/recipeShares";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  const back = backLinkFor(from);
  // Always go through the DAL: it converts snake_case rows to the Recipe
  // shape. Passing a raw row here is what made every edit look unsaved.
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  const [share, headerList] = await Promise.all([getActiveShare(recipe.id), headers()]);
  const origin = `${headerList.get("x-forwarded-proto") ?? "https"}://${headerList.get("x-forwarded-host") ?? headerList.get("host") ?? ""}`;
  const shareWithUrl = share ? { ...share, url: `${origin}${sharePath(share.token)}` } : null;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* key on updatedAt: after a save + router.refresh() the editor
            remounts with the fresh row instead of its stale local copy */}
        <RecipeDetail key={recipe.updatedAt} recipe={recipe} back={back} share={shareWithUrl} />
      </main>
    </>
  );
}
