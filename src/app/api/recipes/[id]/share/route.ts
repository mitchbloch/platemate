import { NextRequest, NextResponse } from "next/server";
import { getActiveShare, getOrCreateShare, revokeShare, sharePath } from "@/lib/recipeShares";
import { getRecipe } from "@/lib/recipes";
import type { RecipeShare } from "@/lib/types";

function withUrl(share: RecipeShare, origin: string) {
  return { ...share, url: `${origin}${sharePath(share.token)}` };
}

/** GET — the caller's active share for this recipe (null if none). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const share = await getActiveShare(id);
    return NextResponse.json(share ? withUrl(share, request.nextUrl.origin) : null);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load share";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** POST — get or create the caller's share link for this recipe. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // RLS makes recipes outside the caller's households invisible
    const recipe = await getRecipe(id);
    if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

    const share = await getOrCreateShare(id);
    return NextResponse.json(withUrl(share, request.nextUrl.origin));
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
