import { NextRequest, NextResponse } from "next/server";
import { parseRecipeFromUrl } from "@/lib/recipeParser";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== "string") {
      return NextResponse.json(
        { error: "Missing required field: url" },
        { status: 400 },
      );
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return NextResponse.json(
        { error: "Invalid URL format" },
        { status: 400 },
      );
    }

    const parsed = await parseRecipeFromUrl(url);
    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse recipe";
    console.error("Recipe parse error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
