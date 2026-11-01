import { fetchPage, type Deadline } from "./fetchPage";
import { ImportFailure } from "./failure";
import { creditedSourceName, stripTracking } from "./platforms";
import { extractEmbeddedJson, extractMeta } from "./text";
import type { ImportSource } from ".";

/** YouTube: the watch page embeds the full description (og:description is
 *  cut at ~160 chars). Transcripts are not fetched: caption tracks now
 *  require a proof-of-origin token from YouTube's bot check (`exp=xpe`;
 *  every track returned an empty 200 on 2026-11-01), and generating one
 *  would mean defeating that check. */
const PLAYER_MARKER = /ytInitialPlayerResponse\s*=\s*/;

interface PlayerResponse {
  playabilityStatus?: { status?: string; reason?: string };
  videoDetails?: { videoId?: string; title?: string; author?: string; shortDescription?: string };
}

/** The 11-char video id from any YouTube URL shape, or null */
export function youTubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const valid = (id: string | null | undefined) => (id && /^[\w-]{11}$/.test(id) ? id : null);
  if (parsed.hostname.toLowerCase() === "youtu.be") return valid(parsed.pathname.split("/")[1]);
  const fromQuery = valid(parsed.searchParams.get("v"));
  if (fromQuery) return fromQuery;
  const match = parsed.pathname.match(/^\/(?:shorts|live|embed|v)\/([^/?#]+)/);
  return valid(match?.[1]);
}

async function fetchOEmbed(id: string, deadline: Deadline): Promise<{ title?: string; author_name?: string } | null> {
  const watch = `https://www.youtube.com/watch?v=${id}`;
  try {
    const { text } = await fetchPage(`https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`, {
      deadline,
      accept: "application/json",
    });
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function extractYouTube(url: string, deadline: Deadline): Promise<ImportSource> {
  const id = youTubeVideoId(url);
  if (!id) throw new ImportFailure("unsupported", "not a YouTube video URL");

  // Always the watch page: embed/shorts/youtu.be variants carry less data
  const page = await fetchPage(`https://www.youtube.com/watch?v=${id}`, { deadline });
  const onConsentWall = new URL(page.url).hostname.startsWith("consent.");
  const player = onConsentWall ? null : (extractEmbeddedJson(page.text, PLAYER_MARKER) as PlayerResponse | null);
  const status = player?.playabilityStatus?.status;
  if (status === "ERROR") throw new ImportFailure("not_found", player?.playabilityStatus?.reason ?? "video unavailable");

  let title: string | undefined;
  let author: string | undefined;
  let description: string | null = null;

  if (player && status === "OK") {
    ({ title, author } = player.videoDetails ?? {});
    description = player.videoDetails?.shortDescription?.trim() || null;
  } else {
    // Consent wall, "confirm you're not a bot", or age gate: take what the
    // public preview offers — never set consent cookies or retry around it
    const oembed = await fetchOEmbed(id, deadline);
    title = oembed?.title;
    author = oembed?.author_name;
    description = onConsentWall ? null : extractMeta(page.text, "og:description");
    if (!title && !description) {
      throw new ImportFailure(status === "LOGIN_REQUIRED" ? "blocked" : "no_recipe", `playability ${status ?? "unknown"}`);
    }
  }

  const caption = [title, description].filter(Boolean).join("\n\n");
  return {
    sections: [{ label: "CAPTION", text: caption }],
    images: [],
    sourceName: creditedSourceName("YouTube", author),
    imageUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    sourceUrl: stripTracking(url),
  };
}
