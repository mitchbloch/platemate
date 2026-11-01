/** Import failures the user can act on, and how they're reported. No
 *  Node or network dependencies: the parser imports this, and the parser
 *  is reachable from client bundles (via recipeGeneration). */

// ── Failures the user can act on (paste text / add screenshots) ──

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

/** 422 body for a failed import: the form switches to Paste Text (with
 *  screenshots) and keeps the link as the recipe's source. */
export function importFailureBody(err: ImportFailure, sourceUrl: string | null) {
  return { error: err.message, reason: err.reason, canPaste: true as const, sourceUrl };
}

/** One structured line per import attempt, for diagnosing source drift */
export function logImport(event: {
  source: string;
  outcome: "ok" | "failed" | "error";
  stage: "extract" | "parse";
  ms: number;
  reason?: ImportFailureReason;
  detail?: string;
}): void {
  console.info("[import]", JSON.stringify(event));
}
