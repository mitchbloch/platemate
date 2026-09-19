import { NextRequest, NextResponse } from "next/server";
import { saveSharedRecipe } from "@/lib/recipeShares";

/** POST — copy a shared recipe into the caller's active household.
 *  Middleware guarantees the caller is signed in (401 otherwise). The copy
 *  and the save count happen in one SECURITY DEFINER RPC, so the count can
 *  only move when a copy was really made. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const result = await saveSharedRecipe(token);
    if (result.existing) {
      // Already in the caller's ACTIVE household (e.g. a partner shared it
      // with them) — point at it instead of duplicating.
      return NextResponse.json({ error: "Already in your library", recipeId: result.recipeId }, { status: 409 });
    }
    return NextResponse.json({ id: result.recipeId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save recipe";
    const status = message.includes("no longer active") ? 404 : message.includes("No active household") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
