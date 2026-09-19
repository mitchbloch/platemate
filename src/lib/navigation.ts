/** Same-origin path check for "return to" links carried in the URL.
 *  Rejects protocol-relative ("//evil") and absolute URLs. */
export function safeInternalPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value;
}

/** Where a recipe page's back link goes and what it says. */
export function backLinkFor(from: unknown): { href: string; label: string } {
  const href = safeInternalPath(from);
  if (href?.startsWith("/plan")) return { href, label: "Back to plan" };
  if (href?.startsWith("/grocery")) return { href, label: "Back to grocery list" };
  return { href: "/recipes", label: "Back to recipes" };
}
