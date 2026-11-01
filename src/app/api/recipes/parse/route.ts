import { NextRequest, NextResponse } from "next/server";
import { parseRecipe } from "@/lib/recipeParser";
import { EXTRACT_BUDGET_MS, IMPORT_BUDGET_MS, extractImportSource } from "@/lib/import";
import { detectSource, stripTracking } from "@/lib/import/platforms";
import { createDeadline, ImportFailure, importFailureBody, logImport, subDeadline } from "@/lib/import/fetchPage";

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
    return NextResponse.json(parsed);
  } catch (error) {
    if (error instanceof ImportFailure) {
      logImport({ source, outcome: "failed", stage, ms: Date.now() - started, reason: error.reason, detail: error.detail });
      return NextResponse.json(importFailureBody(error, stripTracking(url)), { status: 422 });
    }
    logImport({ source, outcome: "error", stage, ms: Date.now() - started });
    console.error("Recipe parse error:", error);
    const message = error instanceof Error ? error.message : "Failed to parse recipe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
