import { NextRequest, NextResponse } from "next/server";
import { parseRecipeFromText } from "@/lib/recipeParser";

// Generous for any real recipe; prevents dumping arbitrarily large payloads
// into a paid Claude call.
const MAX_TEXT_LENGTH = 50_000;

export async function POST(request: NextRequest) {
  try {
    const { text, sourceUrl } = await request.json();

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "Missing required field: text" },
        { status: 400 },
      );
    }

    if (text.length > MAX_TEXT_LENGTH) {
      return NextResponse.json(
        { error: `Recipe text is too long (max ${MAX_TEXT_LENGTH.toLocaleString()} characters)` },
        { status: 400 },
      );
    }

    const parsed = await parseRecipeFromText(
      text.trim(),
      typeof sourceUrl === "string" ? sourceUrl : undefined,
    );
    return NextResponse.json(parsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse recipe";
    console.error("Recipe text parse error:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
