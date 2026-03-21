import { NextRequest, NextResponse } from "next/server";
import { parseRecipeFromUrl, isVideoUrl } from "@/lib/recipeParser";

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

    // Video platforms can't be HTML-scraped — tell frontend to switch to text mode
    if (isVideoUrl(url)) {
      return NextResponse.json(
        {
          error: "This looks like a video link. Video recipes can't be auto-imported — paste the recipe text instead.",
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
