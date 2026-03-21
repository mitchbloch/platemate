import { NextRequest, NextResponse } from "next/server";
import { parseRecipeFromText } from "@/lib/recipeParser";

export async function POST(request: NextRequest) {
  try {
    const { text, sourceUrl } = await request.json();

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Missing required field: text" },
        { status: 400 },
      );
    }

    const parsed = await parseRecipeFromText(text.trim(), sourceUrl);
    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse recipe";
    console.error("Recipe text parse error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
