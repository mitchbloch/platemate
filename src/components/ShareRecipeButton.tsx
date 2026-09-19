"use client";

import { useRef, useState } from "react";
import { useClickOutside } from "@/hooks/useClickOutside";
import { useToast, ToastContainer } from "./Toast";
import { formatRecipeAsText } from "@/lib/recipeShareText";
import { sharePath } from "@/lib/sharePaths";
import type { Recipe, RecipeShare } from "@/lib/types";

/** Public URL for a share, from the page's own origin (never proxy headers). */
function shareUrl(share: RecipeShare): string {
  return `${window.location.origin}${sharePath(share.token)}`;
}

/** Share sheet on a recipe: native share (link + text) with a copy-link
 *  fallback, "Copy as text", "Stop sharing", and the link's view/save counts. */
export default function ShareRecipeButton({
  recipe,
  initialShare,
}: {
  recipe: Recipe;
  initialShare: RecipeShare | null;
}) {
  const [share, setShare] = useState<RecipeShare | null>(initialShare);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false));
  const { toasts, showToast } = useToast();

  async function ensureShare(): Promise<RecipeShare | null> {
    if (share) return share;
    const res = await fetch(`/api/recipes/${recipe.id}/share`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || "Couldn't create a share link");
      return null;
    }
    const created: RecipeShare = await res.json();
    setShare(created);
    return created;
  }

  async function copy(text: string, done: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(done, "success");
    } catch {
      showToast("Couldn't copy — long-press the link to copy it");
    }
  }

  async function handleShare() {
    setBusy(true);
    try {
      const s = await ensureShare();
      if (!s) return;
      const url = shareUrl(s);
      const payload = { title: recipe.title, text: `${recipe.title} — a recipe from Platemate`, url };
      if (typeof navigator.share === "function") {
        try {
          await navigator.share(payload);
        } catch (err) {
          // User dismissed the sheet — not an error
          if (err instanceof Error && err.name === "AbortError") return;
          await copy(url, "Link copied");
        }
      } else {
        await copy(url, "Link copied");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyText() {
    setMenuOpen(false);
    await copy(formatRecipeAsText(recipe, share ? shareUrl(share) : undefined), "Recipe copied as text");
  }

  async function handleStopSharing() {
    setMenuOpen(false);
    const previous = share;
    setShare(null);
    const res = await fetch(`/api/recipes/${recipe.id}/share`, { method: "DELETE" });
    if (!res.ok) {
      setShare(previous);
      showToast("Couldn't stop sharing");
      return;
    }
    showToast("Link disabled", "success");
  }

  return (
    <div className="flex items-center gap-2">
      {share && (
        <span className="hidden text-xs text-text-muted sm:inline" aria-live="polite">
          Shared · {share.viewCount} {share.viewCount === 1 ? "view" : "views"} · {share.saveCount} saved
        </span>
      )}
      <button
        type="button"
        onClick={handleShare}
        disabled={busy}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-border-light disabled:opacity-50"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden="true">
          <path d="M15 8a3 3 0 10-2.977-2.63l-4.94 2.47a3 3 0 100 4.319l4.94 2.47a3 3 0 10.895-1.789l-4.94-2.47a3.027 3.027 0 000-.74l4.94-2.47C13.456 7.68 14.19 8 15 8z" />
        </svg>
        {busy ? "…" : "Share"}
      </button>
      <div className="relative" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="More share options"
          aria-expanded={menuOpen}
          className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-text-secondary transition-colors hover:bg-border-light"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-full z-10 mt-1 min-w-[190px] rounded-xl border border-border bg-surface py-1 shadow-warm-lg">
            <button type="button" onClick={handleCopyText} className="block min-h-11 w-full px-3 text-left text-sm text-text transition-colors hover:bg-border-light">
              Copy as text
            </button>
            {share && (
              <>
                <button type="button" onClick={() => { setMenuOpen(false); copy(shareUrl(share), "Link copied"); }} className="block min-h-11 w-full px-3 text-left text-sm text-text transition-colors hover:bg-border-light">
                  Copy link
                </button>
                <div className="px-3 py-1 text-xs text-text-muted sm:hidden">
                  {share.viewCount} {share.viewCount === 1 ? "view" : "views"} · {share.saveCount} saved
                </div>
                <button type="button" onClick={handleStopSharing} className="block min-h-11 w-full px-3 text-left text-sm text-danger transition-colors hover:bg-border-light">
                  Stop sharing
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <ToastContainer toasts={toasts} />
    </div>
  );
}
