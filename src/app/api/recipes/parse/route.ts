import { NextRequest, NextResponse } from "next/server";
import { parseRecipe } from "@/lib/recipeParser";
import { EXTRACT_BUDGET_MS, IMPORT_BUDGET_MS, extractImportSource } from "@/lib/import";
import { detectSource, stripTracking } from "@/lib/import/platforms";
import { createDeadline, subDeadline } from "@/lib/import/fetchPage";
import { importErrorResult, logImport } from "@/lib/import/failure";

// Extraction (page, transcript) + one Claude call, within IMPORT_BUDGET_MS
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!url || typeof url !== "string") {
    return NextResponse.json({ error: "Missing required field: url" }, { status: 400 });
  }
  try {
    new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
  }

  const source = detectSource(url);
  const started = Date.now();
  const deadline = createDeadline(IMPORT_BUDGET_MS);
  let stage: "extract" | "parse" = "extract";

  try {
    const extracted = await extractImportSource(url, subDeadline(deadline, EXTRACT_BUDGET_MS));
    stage = "parse";
    const parsed = await parseRecipe(extracted, deadline);
    logImport({ source, outcome: "ok", stage, ms: Date.now() - started });
    // The clean, canonical link (short links resolved, tracking stripped)
    // is what the recipe saves as its source
    return NextResponse.json({ ...parsed, sourceUrl: extracted.sourceUrl });
  } catch (error) {
    const { status, body } = importErrorResult(error, { source, stage, started, sourceUrl: stripTracking(url) });
    return NextResponse.json(body, { status });
  }
}
