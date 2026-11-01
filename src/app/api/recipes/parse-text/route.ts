import { NextRequest, NextResponse } from "next/server";
import { parseRecipeFromUserInput } from "@/lib/recipeParser";
import { ImportFailure, importFailureBody, logImport } from "@/lib/import/failure";
import { stripTracking } from "@/lib/import/platforms";
import { MAX_IMPORT_SCREENSHOTS, validateBase64Images } from "@/lib/imageInput";

// One Claude call (with screenshots, reading images takes longer)
export const maxDuration = 60;

// Generous for any real recipe; prevents dumping arbitrarily large payloads
// into a paid Claude call.
const MAX_TEXT_LENGTH = 50_000;

export async function POST(request: NextRequest) {
  let body: { text?: unknown; images?: unknown; sourceUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const sourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl.trim() ? stripTracking(body.sourceUrl.trim()) : null;

  const images = validateBase64Images(body.images, MAX_IMPORT_SCREENSHOTS, "screenshot");
  if (!images.ok) return NextResponse.json({ error: images.error }, { status: 400 });
  if (!text && images.images.length === 0) {
    return NextResponse.json({ error: "Paste the recipe text or add a screenshot" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Recipe text is too long (max ${MAX_TEXT_LENGTH.toLocaleString()} characters)` },
      { status: 400 },
    );
  }

  const source = images.images.length ? "screenshots" : "text";
  const started = Date.now();
  try {
    const parsed = await parseRecipeFromUserInput({ text, images: images.images, sourceUrl });
    logImport({ source, outcome: "ok", stage: "parse", ms: Date.now() - started });
    return NextResponse.json(parsed);
  } catch (error) {
    if (error instanceof ImportFailure) {
      logImport({ source, outcome: "failed", stage: "parse", ms: Date.now() - started, reason: error.reason, detail: error.detail });
      return NextResponse.json(importFailureBody(error, sourceUrl), { status: 422 });
    }
    logImport({ source, outcome: "error", stage: "parse", ms: Date.now() - started });
    console.error("Recipe text parse error:", error);
    const message = error instanceof Error ? error.message : "Failed to parse recipe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
