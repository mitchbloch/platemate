import { NextRequest, NextResponse } from "next/server";
import { getGeneration, markGenerationSaved } from "@/lib/recipeGenerations";
import { createRecipe } from "@/lib/recipes";

/** POST — save the chat's current draft as a recipe and link the chat to it. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const generation = await getGeneration(id);
    if (!generation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    if (generation.status === "saved" && generation.savedRecipeId) {
      return NextResponse.json({ id: generation.savedRecipeId, alreadySaved: true });
    }
    if (!generation.draft) return NextResponse.json({ error: "There's no recipe draft to save yet" }, { status: 400 });

    const recipeId = await createRecipe({ ...generation.draft, sourceUrl: null });
    await markGenerationSaved(id, recipeId);
    return NextResponse.json({ id: recipeId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save recipe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
