"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ParsedRecipe } from "@/lib/types";
import { DIETARY_FLAG_LABELS } from "@/lib/types";
import { isVideoSource } from "@/lib/import/platforms";
import { MAX_IMPORT_SCREENSHOTS } from "@/lib/imageInput";
import { SCREENSHOT_MAX_EDGE_PX } from "@/lib/imageDownscale";
import { usePhotoAttachments } from "@/hooks/usePhotoAttachments";
import AttachedPhotos from "./AttachedPhotos";
import NutritionBadge from "./NutritionBadge";
import RecipeEditor, { toEditableRecipe, fromEditableRecipe, type EditableRecipe } from "./RecipeEditor";

type InputMode = "url" | "text";

const FALLBACK_HINT = "Paste the recipe text or add screenshots below instead.";

type FormState =
  | { step: "input" }
  | { step: "parsing" }
  | { step: "review"; parsed: ParsedRecipe }
  | { step: "saving" }
  // "warning": something the user can do next (paste, add screenshots);
  // "error": something went wrong on our side
  | { step: "error"; message: string; tone: "warning" | "error" };

export default function RecipeForm() {
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [recipeText, setRecipeText] = useState("");
  const [formState, setFormState] = useState<FormState>({ step: "input" });
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editedRecipe, setEditedRecipe] = useState<EditableRecipe | null>(null);
  const [attachNote, setAttachNote] = useState<string | null>(null);
  const screenshots = usePhotoAttachments(MAX_IMPORT_SCREENSHOTS, SCREENSHOT_MAX_EDGE_PX);
  const fileInput = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function addScreenshots(files: FileList | null) {
    const problem = await screenshots.add(files);
    setAttachNote(
      problem === "too_many"
        ? `Up to ${MAX_IMPORT_SCREENSHOTS} screenshots`
        : problem === "unreadable"
          ? "Couldn't read that image — try a PNG or JPEG screenshot"
          : null,
    );
    if (fileInput.current) fileInput.current.value = "";
  }

  async function handleParse(e: React.FormEvent) {
    e.preventDefault();

    if (inputMode === "url" && !url.trim()) return;
    if (inputMode === "text" && !recipeText.trim() && screenshots.photos.length === 0) {
      setFormState({ step: "error", message: "Paste the recipe text or add a screenshot.", tone: "warning" });
      return;
    }

    setFormState({ step: "parsing" });

    try {
      let res: Response;

      if (inputMode === "text") {
        res = await fetch("/api/recipes/parse-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: recipeText.trim(),
            images: screenshots.photos.map((p) => p.base64),
            sourceUrl: url.trim() || undefined,
          }),
        });
      } else {
        res = await fetch("/api/recipes/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: url.trim() }),
        });
      }

      if (!res.ok) {
        const data = await res.json();
        // Import failed for a reason the user can work around (site blocks
        // us, private post, no recipe found): switch to Paste Text and keep
        // the link as the recipe's source
        if (data.canPaste) {
          setInputMode("text");
          if (typeof data.sourceUrl === "string") setUrl(data.sourceUrl);
          setFormState({
            step: "error",
            message: `${data.error} ${FALLBACK_HINT}`,
            tone: "warning",
          });
          return;
        }
        throw new Error(data.error || "Failed to parse recipe");
      }

      // The server returns the link to save: short links resolved to the
      // canonical post, tracking params stripped
      const { sourceUrl, ...parsed }: ParsedRecipe & { sourceUrl?: string | null } = await res.json();
      if (sourceUrl !== undefined) setUrl(sourceUrl ?? "");
      setEditedRecipe(toEditableRecipe(parsed));
      setFormState({ step: "review", parsed });
    } catch (err) {
      setFormState({
        step: "error",
        message: err instanceof Error ? err.message : "Unknown error",
        tone: "error",
      });
    }
  }

  async function handleSave() {
    if (!editedRecipe || formState.step !== "review") return;
    const { parsed } = formState;

    setFormState({ step: "saving" });

    try {
      // Editable fields come from the editor; everything Claude produced
      // that the user can't edit (nutrition, flags, image, source) is kept.
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed,
          ...fromEditableRecipe(editedRecipe),
          sourceUrl: url.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save recipe");
      }

      const { id } = await res.json();
      router.push(`/recipes/${id}`);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Unknown error");
      setFormState({ step: "review", parsed });
    }
  }

  // ── Input step ──
  if (formState.step === "input" || formState.step === "error") {
    return (
      <div>
        <form onSubmit={handleParse} className="space-y-4">
          {/* First, so a fallback's reason is visible on a phone without scrolling */}
          {formState.step === "error" && (
            <div
              role="status"
              className={`rounded-xl border p-3 text-sm ${
                formState.tone === "warning"
                  ? "border-gold-light bg-gold-light/50 text-gold"
                  : "border-danger-light bg-danger-light/50 text-danger"
              }`}
            >
              {formState.message}
            </div>
          )}

          {inputMode === "url" ? (
            <div>
              <label
                htmlFor="url"
                className="mb-1 block text-sm font-medium text-text-secondary"
              >
                Recipe URL
              </label>
              <input
                id="url"
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Paste any recipe link — websites, TikTok, YouTube..."
                required
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
              />
              <p className="mt-1.5 text-xs text-text-muted">
                Works with recipe sites, TikTok, and YouTube.{" "}
                <button
                  type="button"
                  onClick={() => setInputMode("text")}
                  className="text-primary hover:text-primary-dark"
                >
                  Or paste recipe text instead
                </button>
              </p>
            </div>
          ) : (
            <>
              <div>
                <label
                  htmlFor="recipe-text"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Recipe Text
                </label>
                <textarea
                  id="recipe-text"
                  value={recipeText}
                  onChange={(e) => setRecipeText(e.target.value)}
                  placeholder="Paste the recipe here — ingredients, instructions, whatever you have. It doesn't need to be perfectly formatted."
                  rows={8}
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
                />
                <div className="mt-2 space-y-2">
                  <AttachedPhotos photos={screenshots.photos} onRemove={screenshots.remove} noun="screenshot" />
                  <label
                    className={`inline-flex min-h-11 cursor-pointer items-center rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-border-light ${screenshots.full ? "pointer-events-none opacity-50" : ""}`}
                  >
                    📷 Add screenshots ({screenshots.photos.length}/{MAX_IMPORT_SCREENSHOTS})
                    <input
                      ref={fileInput}
                      type="file"
                      accept="image/*"
                      multiple
                      className="sr-only"
                      onChange={(e) => addScreenshots(e.target.files)}
                      disabled={screenshots.full}
                    />
                  </label>
                  {attachNote && <p role="alert" className="text-xs text-danger">{attachNote}</p>}
                </div>
                <p className="mt-1.5 text-xs text-text-muted">
                  For captions, screenshots of a post or recipe card, or anything that couldn&apos;t be auto-imported.{" "}
                  <button
                    type="button"
                    onClick={() => setInputMode("url")}
                    className="text-primary hover:text-primary-dark"
                  >
                    Or paste a URL instead
                  </button>
                </p>
              </div>
              {/* Optional source URL for text mode */}
              <div>
                <label
                  htmlFor="source-url"
                  className="mb-1 block text-sm font-medium text-text-secondary"
                >
                  Source URL <span className="text-text-muted">(optional)</span>
                </label>
                <input
                  id="source-url"
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.instagram.com/..."
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light"
                />
              </div>
            </>
          )}

          <button
            type="submit"
            className="rounded-lg bg-primary px-6 py-2 font-medium text-white shadow-warm transition-colors hover:bg-primary-dark"
          >
            Import Recipe
          </button>
        </form>
      </div>
    );
  }

  // ── Parsing step ──
  if (formState.step === "parsing") {
    const isVideo = isVideoSource(url);
    return (
      <div className="py-12 text-center">
        <div className="spinner mx-auto mb-4 h-8 w-8" />
        <p className="text-text-secondary">
          {inputMode === "text"
            ? screenshots.photos.length
              ? "Reading screenshots..."
              : "Analyzing recipe text..."
            : isVideo
              ? "Extracting recipe from video..."
              : "Fetching recipe and analyzing nutrition..."}
        </p>
        <p className="mt-1 text-sm text-text-muted">This may take a few seconds</p>
      </div>
    );
  }

  // ── Saving step ──
  if (formState.step === "saving") {
    return (
      <div className="py-12 text-center">
        <div className="spinner mx-auto mb-4 h-8 w-8" />
        <p className="text-text-secondary">Saving recipe...</p>
      </div>
    );
  }

  // ── Review step ──
  if (!editedRecipe || formState.step !== "review") return null;
  const parsed = formState.parsed;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-accent-light bg-accent-light/50 p-3 text-sm text-accent">
        Review the extracted recipe below. Edit any fields before saving.
      </div>

      {parsed.dietaryFlags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {parsed.dietaryFlags.map((flag) => (
            <span key={flag} className="rounded-md bg-accent-light px-2 py-0.5 text-xs text-accent">
              {DIETARY_FLAG_LABELS[flag]}
            </span>
          ))}
        </div>
      )}

      <RecipeEditor value={editedRecipe} onChange={setEditedRecipe} />

      <NutritionBadge nutrition={parsed.nutrition} />

      {saveError && (
        <div role="alert" className="rounded-xl border border-danger-light bg-danger-light/50 p-3 text-sm text-danger">
          {saveError}
        </div>
      )}

      <div className="flex gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={handleSave}
          className="min-h-11 rounded-lg bg-primary px-6 py-2 font-medium text-white shadow-warm transition-colors hover:bg-primary-dark"
        >
          Save Recipe
        </button>
        <button
          type="button"
          onClick={() => {
            setFormState({ step: "input" });
            setEditedRecipe(null);
            setSaveError(null);
          }}
          className="min-h-11 rounded-lg border border-border px-6 py-2 text-text-secondary transition-colors hover:bg-border-light hover:text-text"
        >
          Start Over
        </button>
      </div>
    </div>
  );
}
