import Nav from "@/components/Nav";
import RecipeDetail from "@/components/RecipeDetail";
import { getRecipe } from "@/lib/recipes";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Always go through the DAL: it converts snake_case rows to the Recipe
  // shape. Passing a raw row here is what made every edit look unsaved.
  const recipe = await getRecipe(id);
  if (!recipe) notFound();

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        {/* key on updatedAt: after a save + router.refresh() the editor
            remounts with the fresh row instead of its stale local copy */}
        <RecipeDetail key={recipe.updatedAt} recipe={recipe} />
      </main>
    </>
  );
}
