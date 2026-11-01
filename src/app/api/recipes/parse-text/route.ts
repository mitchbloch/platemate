import { NextRequest, NextResponse } from "next/server";
import { parseRecipeFromText } from "@/lib/recipeParser";
import { ImportFailure, importFailureBody, logImport } from "@/lib/import/fetchPage";
import { stripTracking } from "@/lib/import/platforms";

// One Claude call
export const maxDuration = 60;

// Generous for any real recipe; prevents dumping arbitrarily large payloads
// into a paid Claude call.
const MAX_TEXT_LENGTH = 50_000;

export async function POST(request: NextRequest) {
  let body: { text?: unknown; sourceUrl?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { text } = body;
  const sourceUrl = typeof body.sourceUrl === "string" && body.sourceUrl.trim() ? stripTracking(body.sourceUrl.trim()) : null;

  if (!text || typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "Missing required field: text" }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return NextResponse.json(
      { error: `Recipe text is too long (max ${MAX_TEXT_LENGTH.toLocaleString()} characters)` },
      { status: 400 },
    );
  }

  const started = Date.now();
  try {
    const parsed = await parseRecipeFromText(text.trim(), sourceUrl ?? undefined);
    logImport({ source: "text", outcome: "ok", stage: "parse", ms: Date.now() - started });
    return NextResponse.json(parsed);
  } catch (error) {
    if (error instanceof ImportFailure) {
      logImport({ source: "text", outcome: "failed", stage: "parse", ms: Date.now() - started, reason: error.reason, detail: error.detail });
      return NextResponse.json(importFailureBody(error, sourceUrl), { status: 422 });
    }
    logImport({ source: "text", outcome: "error", stage: "parse", ms: Date.now() - started });
    console.error("Recipe text parse error:", error);
    const message = error instanceof Error ? error.message : "Failed to parse recipe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
