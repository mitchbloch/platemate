import { NextRequest, NextResponse } from "next/server";
import { getActiveShare, getOrCreateShare, revokeShare } from "@/lib/recipeShares";
import { getRecipe } from "@/lib/recipes";

// The client builds the public URL from its own origin + share.token, so
// this route never has to trust proxy headers to know the app's host.

/** GET — the caller's active share for this recipe (null if none). */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    return NextResponse.json(await getActiveShare(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load share";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — get or create the caller's share link for this recipe. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // RLS makes recipes outside the caller's households invisible; the
    // share is filed under the recipe's own household.
    const recipe = await getRecipe(id);
    if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    return NextResponse.json(await getOrCreateShare({ id: recipe.id, householdId: recipe.householdId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create share link";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** DELETE — stop sharing (revokes the caller's active link). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const share = await getActiveShare(id);
    if (share) await revokeShare(share.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to stop sharing";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
