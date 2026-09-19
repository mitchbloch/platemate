"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { GenerationMessage, ParsedRecipe, RecipeGeneration } from "@/lib/types";
import { CUISINE_LABELS, MEAL_TYPE_LABELS } from "@/lib/types";
import { MAX_PHOTOS, MAX_TURNS } from "@/lib/recipeGeneration";
import { downscaleToJpegBase64 } from "@/lib/imageDownscale";
import { getCurrentWeekStart } from "@/lib/weekDates";
import { useUrlMirror } from "@/hooks/useUrlMirror";
import NutritionBadge from "./NutritionBadge";
import { useToast, ToastContainer } from "./Toast";

interface Props {
  drafts: RecipeGeneration[];
  initial: RecipeGeneration | null;
}

type Photo = { id: string; preview: string; base64: string };

const primaryBtn = "inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-white shadow-warm transition-colors hover:bg-primary-dark disabled:opacity-50";
const secondaryBtn = "inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm text-text-secondary transition-colors hover:bg-border-light disabled:opacity-50";

export default function RecipeGenerator({ drafts: initialDrafts, initial }: Props) {
  const router = useRouter();
  const { toasts, showToast } = useToast();
  const [drafts, setDrafts] = useState(initialDrafts);
  const [chat, setChat] = useState<RecipeGeneration | null>(initial);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useUrlMirror({ g: chat?.id ?? "" }, 0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView?.({ block: "end" });
  }, [chat?.messages.length, sending]);

  const userTurns = chat?.messages.filter((m) => m.role === "user").length ?? 0;
  const readOnly = chat?.status === "saved";
  const atCap = userTurns >= MAX_TURNS;

  async function send(message: string, attached: Photo[] = photos) {
    if (sending || readOnly) return;
    const body = { generationId: chat?.id ?? null, message, images: attached.map((p) => p.base64) };
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      const updated: RecipeGeneration = data;
      setChat(updated);
      setDrafts((prev) => [updated, ...prev.filter((d) => d.id !== updated.id)]);
      setText("");
      setPhotos([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    const room = MAX_PHOTOS - photos.length;
    const chosen = Array.from(files).slice(0, room);
    if (files.length > room) showToast(`Up to ${MAX_PHOTOS} photos per message`);
    try {
      const next = await Promise.all(
        chosen.map(async (f) => {
          const base64 = await downscaleToJpegBase64(f);
          return { id: `${f.name}-${f.lastModified}-${Math.random()}`, preview: `data:image/jpeg;base64,${base64}`, base64 };
        }),
      );
      setPhotos((prev) => [...prev, ...next]);
    } catch {
      showToast("Couldn't read that photo");
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function saveDraft() {
    if (!chat?.draft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/generate/${chat.id}/save`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save");
      router.push(`/recipes/${data.id}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't save");
      setSaving(false);
    }
  }

  async function discard() {
    if (!chat) return;
    const id = chat.id;
    setChat(null);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    const res = await fetch(`/api/generate/${id}`, { method: "DELETE" });
    if (!res.ok) showToast("Couldn't discard that chat");
  }

  async function addToPlan(recipeId: string, mealType: string) {
    const res = await fetch("/api/meal-plans/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart: getCurrentWeekStart(), recipeId, mealType }),
    });
    showToast(res.ok ? "Added to this week's plan" : "Couldn't add to the plan", res.ok ? "success" : "error");
  }

  const messages = chat?.messages ?? [];

  return (
    <div className="space-y-4">
      {/* Drafts strip */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => { setChat(null); setError(null); }} className={`${secondaryBtn} ${!chat ? "border-primary text-primary" : ""}`}>
          + New chat
        </button>
        {drafts.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => { setChat(d); setError(null); }}
            className={`inline-flex min-h-11 max-w-[60vw] items-center truncate rounded-full border px-3 text-sm transition-colors sm:max-w-xs ${chat?.id === d.id ? "border-primary bg-primary-light/40 text-primary" : "border-border text-text-secondary hover:bg-border-light"}`}
            title={d.title}
          >
            {d.title}
          </button>
        ))}
      </div>

      {/* Thread */}
      <div className="space-y-4 rounded-2xl border border-border bg-surface p-4 shadow-warm">
        {messages.length === 0 && (
          <div className="py-6 text-center text-sm text-text-muted">
            <p className="mb-1 font-medium text-text-secondary">Tell me what you feel like eating, or snap what&rsquo;s in the fridge.</p>
            <p>I&rsquo;ll suggest directions, match recipes you already have, and write up a full recipe with nutrition when you pick one.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <MessageView key={i} message={m} readOnly={readOnly || sending} chatId={chat?.id ?? ""} onPick={(title) => send(`Let's make: ${title}`, [])} onAddToPlan={addToPlan} />
        ))}
        {sending && (
          <div className="flex items-center gap-2 text-sm text-text-muted" role="status">
            <div className="spinner h-4 w-4" />
            Cooking up ideas… a full recipe takes 10–20 seconds
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Draft actions */}
      {chat?.draft && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-accent-light bg-accent-light/40 p-3">
          <span className="min-w-0 flex-1 text-sm text-accent">
            {readOnly ? "Saved to your recipes." : `Current draft: ${chat.draft.title}`}
          </span>
          {readOnly && chat.savedRecipeId ? (
            <Link href={`/recipes/${chat.savedRecipeId}`} className={primaryBtn}>Open recipe</Link>
          ) : (
            <>
              <button type="button" onClick={discard} className={secondaryBtn} disabled={saving}>Discard</button>
              <button type="button" onClick={saveDraft} className={primaryBtn} disabled={saving}>{saving ? "Saving…" : "Save to my recipes"}</button>
            </>
          )}
        </div>
      )}

      {/* Composer */}
      {!readOnly && (
        <form
          onSubmit={(e) => { e.preventDefault(); if (text.trim() || photos.length) send(text.trim()); }}
          className="space-y-2 rounded-2xl border border-border bg-surface p-3 shadow-warm"
        >
          {photos.length > 0 && (
            <div className="flex gap-2">
              {photos.map((p) => (
                <div key={p.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.preview} alt="Attached photo" className="h-16 w-16 rounded-lg object-cover" />
                  <button type="button" onClick={() => setPhotos((prev) => prev.filter((x) => x.id !== p.id))} aria-label="Remove photo" className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-text text-xs text-white">&times;</button>
                </div>
              ))}
            </div>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={atCap ? "This chat is full — save the draft or start a new one" : messages.length ? "Change something, or ask for another idea…" : "e.g. a quick weeknight dinner with chicken thighs and rice"}
            rows={2}
            disabled={sending || atCap}
            aria-label="Message"
            enterKeyHint="send"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (text.trim() || photos.length) send(text.trim());
              }
            }}
            className="w-full resize-none rounded-lg border border-border bg-bg px-3 py-2 text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-light disabled:opacity-60"
          />
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex items-center justify-between gap-2">
            <label className={`${secondaryBtn} cursor-pointer ${photos.length >= MAX_PHOTOS || sending ? "pointer-events-none opacity-50" : ""}`}>
              📷 Photo
              <input ref={fileInput} type="file" accept="image/*" multiple className="sr-only" onChange={(e) => addPhotos(e.target.files)} disabled={photos.length >= MAX_PHOTOS || sending} />
            </label>
            <span className="text-xs text-text-muted">{userTurns}/{MAX_TURNS}</span>
            <button type="submit" className={primaryBtn} disabled={sending || atCap || (!text.trim() && photos.length === 0)}>Send</button>
          </div>
        </form>
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
}

function MessageView({
  message, readOnly, chatId, onPick, onAddToPlan,
}: {
  message: GenerationMessage;
  readOnly: boolean;
  chatId: string;
  onPick: (title: string) => void;
  onAddToPlan: (recipeId: string, mealType: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-4 py-2 text-sm text-white">
          <p className="whitespace-pre-wrap">{message.content}</p>
          {message.photoCount > 0 && (
            <p className="mt-1 text-xs text-white/80">
              📷 {message.photoCount} photo{message.photoCount === 1 ? "" : "s"}
              {message.seenIngredients.length > 0 && ` · saw: ${message.seenIngredients.join(", ")}`}
            </p>
          )}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-sm text-text">{message.reply}</p>
      {message.options && (
        <div className="flex flex-col gap-2">
          {message.options.map((o) => (
            <button
              key={o.title}
              type="button"
              disabled={readOnly}
              onClick={() => onPick(o.title)}
              className="rounded-xl border border-border bg-bg px-3 py-2 text-left transition-colors hover:border-primary disabled:opacity-60"
            >
              <span className="block text-sm font-medium text-text">{o.title}</span>
              {o.summary && <span className="block text-xs text-text-muted">{o.summary}</span>}
            </button>
          ))}
        </div>
      )}
      {message.libraryMatches.length > 0 && (
        <div className="rounded-xl bg-accent-light/40 p-3">
          <p className="mb-2 text-xs font-medium text-accent">Already in your library</p>
          <ul className="space-y-2">
            {message.libraryMatches.map((m) => (
              <li key={m.recipeId} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="min-w-0 flex-1">
                  <Link href={`/recipes/${m.recipeId}?from=${encodeURIComponent(`/recipes/generate?g=${chatId}`)}`} className="font-medium text-text hover:text-primary">{m.title}</Link>
                  <span className="block text-xs text-text-muted">{m.reason}</span>
                </div>
                <button type="button" onClick={() => onAddToPlan(m.recipeId, "dinner")} className="min-h-9 shrink-0 rounded-md border border-accent/30 px-2 text-xs text-accent hover:bg-surface">
                  Add to this week
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {message.recipe && <DraftCard recipe={message.recipe} />}
    </div>
  );
}

function DraftCard({ recipe: r }: { recipe: ParsedRecipe }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl border border-border bg-bg p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-semibold text-text">{r.title}</h3>
          <div className="mt-1 flex flex-wrap gap-2 text-xs text-text-muted">
            <span className="rounded-md bg-accent-light px-1.5 py-0.5 text-accent">{CUISINE_LABELS[r.cuisine]}</span>
            <span>{MEAL_TYPE_LABELS[r.mealType]}</span>
            <span>{r.servings} servings</span>
            {r.totalTimeMinutes ? <span>{r.totalTimeMinutes} min</span> : null}
          </div>
        </div>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="min-h-9 shrink-0 text-xs text-text-muted hover:text-text-secondary">
          {open ? "Collapse" : "Expand"}
        </button>
      </div>
      {r.description && <p className="mb-3 text-sm text-text-secondary">{r.description}</p>}
      <NutritionBadge nutrition={r.nutrition} compact />
      {open && (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">Ingredients</h4>
            <ul className="space-y-1 text-sm text-text-secondary">
              {r.ingredients.map((ing, i) => <li key={i}>{ing.raw}</li>)}
            </ul>
          </div>
          <div>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-text-muted">Instructions</h4>
            <ol className="list-decimal space-y-1 pl-4 text-sm text-text-secondary">
              {r.instructions.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
