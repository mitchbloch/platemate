import { NextRequest, NextResponse } from "next/server";
import { parseRecipeFromUrl, parseRecipeFromText, isVideoUrl, extractVideoContent } from "@/lib/recipeParser";

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

    // Video platforms: try auto-extraction first, fall back to manual text paste
    if (isVideoUrl(url)) {
      try {
        const extracted = await extractVideoContent(url);
        if (extracted) {
          const parsed = await parseRecipeFromText(extracted.text, url);
          return NextResponse.json(parsed);
        }
      } catch (err) {
        console.error("Video content extraction failed:", err);
      }
      // Extraction failed or insufficient content — ask user to paste text
      return NextResponse.json(
        {
          error: "Couldn't auto-extract the recipe from this video. Paste the recipe text instead.",
          isVideoUrl: true,
        },
        { status: 422 },
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
