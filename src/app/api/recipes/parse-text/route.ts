import { NextRequest, NextResponse } from "next/server";
import { parseRecipeFromUserInput } from "@/lib/recipeParser";
import { IMPORT_BUDGET_MS } from "@/lib/import";
import { createDeadline } from "@/lib/import/fetchPage";
import { importErrorResult, logImport } from "@/lib/import/failure";
import { stripTracking } from "@/lib/import/platforms";
import { MAX_IMPORT_SCREENSHOTS, validateBase64Images } from "@/lib/imageInput";

// One Claude call (reading screenshots takes longer), within IMPORT_BUDGET_MS
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
    const parsed = await parseRecipeFromUserInput(
      { text, images: images.images, sourceUrl },
      createDeadline(IMPORT_BUDGET_MS),
    );
    logImport({ source, outcome: "ok", stage: "parse", ms: Date.now() - started });
    return NextResponse.json({ ...parsed, sourceUrl });
  } catch (error) {
    const { status, body } = importErrorResult(error, { source, stage: "parse", started, sourceUrl });
    return NextResponse.json(body, { status });
  }
}
