import { NextRequest, NextResponse } from "next/server";
import { getSharedRecipe, recordShareSave } from "@/lib/recipeShares";
import { createRecipe, getRecipe } from "@/lib/recipes";

/** POST — copy a shared recipe into the caller's active household.
 *  Middleware guarantees the caller is signed in (401 otherwise). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const shared = await getSharedRecipe(token);
    if (!shared) return NextResponse.json({ error: "This link is no longer active" }, { status: 404 });

    // If the caller can already see the source recipe, it's in one of their
    // households — don't create a duplicate, point them at it.
    const own = await getRecipe(shared.recipeId);
    if (own) return NextResponse.json({ error: "Already in your library", recipeId: own.id }, { status: 409 });

    const r = shared.recipe;
    const id = await createRecipe({
      title: r.title,
      description: r.description,
      cuisine: r.cuisine,
      mealType: r.mealType,
      difficulty: r.difficulty,
      servings: r.servings,
      totalTimeMinutes: r.totalTimeMinutes,
      ingredients: r.ingredients,
      instructions: r.instructions,
      nutrition: r.nutrition ?? { calories: 0, protein: 0, carbs: 0, fat: 0, saturatedFat: 0, cholesterol: 0, fiber: 0, sodium: 0 },
      dietaryFlags: r.dietaryFlags,
      tags: r.tags,
      imageUrl: r.imageUrl,
      isSlowCooker: r.isSlowCooker,
      sourceName: r.sourceName,
      sourceUrl: r.sourceUrl,
    });

    // Best-effort analytics: a failed count must not undo a successful save
    try {
      await recordShareSave(token);
    } catch (err) {
      console.error("[share save] count failed:", err);
    }

    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save recipe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
