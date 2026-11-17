import { fetchPage, subDeadline, type Deadline } from "./fetchPage";
import { ImportFailure } from "./failure";
import { creditedSourceName, stripTracking } from "./platforms";
import { extractEmbeddedJson, vttToText } from "./text";
import type { ImportSource } from ".";

/** TikTok's oEmbed stopped returning captions (~2026-10-19). The public
 *  video page still embeds the post as JSON: caption, author, and a
 *  signed WebVTT auto-transcript URL (expires in days — fetched, never
 *  stored). One page fetch per pasted link (decision 1). */
const REHYDRATION_MARKER = /<script[^>]*id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>/;
const TRANSCRIPT_BUDGET_MS = 4_000;
const MAX_TRANSCRIPT_CHARS = 20_000;

interface SubtitleInfo {
  Url?: string;
  Source?: string; // "ASR" (speech recognition) or "MT" (machine translation)
  LanguageCodeName?: string; // "eng-US"
  Format?: string;
}

interface TikTokItem {
  id?: string;
  desc?: string;
  textLanguage?: string;
  privateItem?: boolean;
  author?: { uniqueId?: string; nickname?: string };
  video?: { subtitleInfos?: SubtitleInfo[] };
  imagePost?: unknown;
}

interface VideoDetail {
  statusCode?: number;
  statusMsg?: string;
  itemInfo?: { itemStruct?: TikTokItem };
}

/** Speech-recognition track in the post's own language, over translations */
export function pickSubtitle(subtitles: SubtitleInfo[], language: string | undefined): SubtitleInfo | null {
  const usable = subtitles.filter((s) => typeof s.Url === "string" && (!s.Format || s.Format === "webvtt"));
  const lang = (language ?? "").toLowerCase().slice(0, 2);
  const score = (s: SubtitleInfo) =>
    (s.Source === "ASR" ? 2 : 0) + (lang && s.LanguageCodeName?.toLowerCase().startsWith(lang) ? 1 : 0);
  return usable.sort((a, b) => score(b) - score(a))[0] ?? null;
}

async function fetchTranscript(url: string, deadline: Deadline): Promise<string | null> {
  try {
    const { text } = await fetchPage(url, {
      deadline: subDeadline(deadline, TRANSCRIPT_BUDGET_MS),
      accept: "text/vtt,text/plain,*/*",
      maxBytes: 500_000,
      ignoreContentType: true, // the CDN labels WebVTT as video/mp4
    });
    if (!text.replace(/^﻿/, "").startsWith("WEBVTT")) return null;
    return vttToText(text).slice(0, MAX_TRANSCRIPT_CHARS) || null;
  } catch {
    return null; // best-effort: the caption alone often has the full recipe
  }
}

export async function extractTikTok(url: string, deadline: Deadline): Promise<ImportSource> {
  // Follows /t/<code>, vm., vt. short links to the canonical post
  const page = await fetchPage(url, { deadline });
  const data = extractEmbeddedJson(page.text, REHYDRATION_MARKER) as
    | { __DEFAULT_SCOPE__?: Record<string, unknown> }
    | null;
  const detail = data?.__DEFAULT_SCOPE__?.["webapp.video-detail"] as VideoDetail | undefined;
  // A page without the post data is a login wall or a bot check
  if (!detail) throw new ImportFailure("blocked", "no webapp.video-detail on the page");

  const item = detail.itemInfo?.itemStruct;
  if (detail.statusCode !== 0 || !item) {
    const msg = `statusCode ${detail.statusCode} ${detail.statusMsg ?? ""}`.trim();
    const isPrivate = item?.privateItem || /private|login/i.test(detail.statusMsg ?? "");
    throw new ImportFailure(isPrivate ? "login_required" : "not_found", msg);
  }
  if (item.privateItem) throw new ImportFailure("login_required", "private post");

  const caption = item.desc?.trim() ?? "";
  // Photo carousels have no audio track; a caption is all there is
  const subtitle = item.imagePost ? null : pickSubtitle(item.video?.subtitleInfos ?? [], item.textLanguage);
  const transcript = subtitle?.Url ? await fetchTranscript(subtitle.Url, deadline) : null;

  const sections: ImportSource["sections"] = [];
  if (caption) sections.push({ label: "CAPTION", text: caption });
  if (transcript) sections.push({ label: "TRANSCRIPT", text: transcript });
  if (sections.length === 0) throw new ImportFailure("no_recipe", "no caption or transcript");

  const author = item.author?.nickname || item.author?.uniqueId;
  return {
    sections,
    images: [],
    sourceName: creditedSourceName("TikTok", author),
    imageUrl: null, // cover URLs are signed and expire within days
    sourceUrl: stripTracking(page.url),
  };
}
