/** Import failures the user can act on, and how they're reported. No
 *  Node, network or Next.js dependencies: the parser imports this, and the
 *  parser is reachable from client bundles (via recipeGeneration). */

export type ImportFailureReason =
  | "blocked"
  | "login_required"
  | "not_found"
  | "no_recipe"
  | "unsupported"
  | "fetch_failed";

const FAILURE_MESSAGES: Record<ImportFailureReason, string> = {
  blocked: "This site doesn't allow automatic import.",
  login_required: "This post is private or needs a login.",
  // Some sites answer apps with a 404 rather than a block page, so a 404
  // can't tell "broken link" from "no automatic import" — say both
  not_found: "Couldn't open that page — the link may be broken, or the site may not allow automatic import.",
  no_recipe: "Couldn't find a full recipe there (it may be behind a paywall).",
  unsupported: "That link isn't a page we can read.",
  fetch_failed: "Couldn't reach that page.",
};

/** An import that failed for a reason outside our control. The route turns
 *  it into a 422 that moves the user to Paste Text; `detail` is for logs. */
export class ImportFailure extends Error {
  constructor(
    readonly reason: ImportFailureReason,
    readonly detail?: string,
  ) {
    super(FAILURE_MESSAGES[reason]);
    this.name = "ImportFailure";
  }
}

type ImportStage = "extract" | "parse";

/** One structured line per import attempt, for diagnosing source drift */
export function logImport(event: {
  source: string;
  outcome: "ok" | "failed" | "error";
  stage: ImportStage;
  ms: number;
  reason?: ImportFailureReason;
  detail?: string;
}): void {
  console.info("[import]", JSON.stringify(event));
}

/** Status + body for an import that threw, logged. An ImportFailure is a
 *  422 the form acts on (switch to Paste Text, keep the link as the
 *  source); anything else is a 500. Plain data, so routes wrap it. */
export function importErrorResult(
  error: unknown,
  ctx: { source: string; stage: ImportStage; started: number; sourceUrl: string | null },
): { status: 422 | 500; body: Record<string, unknown> } {
  const ms = Date.now() - ctx.started;
  if (error instanceof ImportFailure) {
    logImport({ source: ctx.source, outcome: "failed", stage: ctx.stage, ms, reason: error.reason, detail: error.detail });
    return {
      status: 422,
      body: { error: error.message, reason: error.reason, canPaste: true, sourceUrl: ctx.sourceUrl },
    };
  }
  logImport({ source: ctx.source, outcome: "error", stage: ctx.stage, ms });
  console.error("Recipe import error:", error);
  return { status: 500, body: { error: error instanceof Error ? error.message : "Failed to import recipe" } };
}
