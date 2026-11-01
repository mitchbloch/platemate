/** Import source detection — pure and client-safe (RecipeForm uses it for
 *  spinner copy; the server uses it to pick an extractor). */

export type ImportSourceKind = "tiktok" | "youtube" | "instagram" | "pinterest" | "web";

// Exact hostnames; every subdomain of these also matches (vm., vt., m., ...)
const SOURCE_DOMAINS: Record<Exclude<ImportSourceKind, "web" | "pinterest">, string[]> = {
  tiktok: ["tiktok.com"],
  youtube: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
  instagram: ["instagram.com"],
};

/** Pinterest has a country domain per market (pinterest.com, .co.uk, .de, ...) */
function isPinterestHost(host: string): boolean {
  if (host === "pin.it") return true;
  const labels = host.split(".");
  const i = labels.lastIndexOf("pinterest");
  // "pinterest" must be the registrable label: followed by a TLD or a
  // two-part ccTLD (co.uk, com.au), never by another domain
  if (i === -1) return false;
  const suffix = labels.slice(i + 1);
  return suffix.length === 1 || (suffix.length === 2 && suffix[0].length <= 3 && suffix[1].length === 2);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function detectSource(url: string): ImportSourceKind {
  const host = hostOf(url);
  if (!host) return "web";
  for (const [kind, domains] of Object.entries(SOURCE_DOMAINS)) {
    if (domains.some((d) => host === d || host.endsWith(`.${d}`))) {
      return kind as ImportSourceKind;
    }
  }
  return isPinterestHost(host) ? "pinterest" : "web";
}

export function isVideoSource(url: string): boolean {
  const kind = detectSource(url);
  return kind === "tiktok" || kind === "youtube" || kind === "instagram";
}

// Share/analytics params that never change which recipe a URL points at
const TRACKING_PARAMS = new Set(["si", "igsh", "igshid", "_t", "_r", "is_from_webapp", "sender_device", "fbclid", "gclid"]);

/** Drop share/analytics params so the saved source URL is clean and stable */
export function stripTracking(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  for (const key of [...parsed.searchParams.keys()]) {
    if (TRACKING_PARAMS.has(key) || key.startsWith("utm_")) parsed.searchParams.delete(key);
  }
  return parsed.toString();
}
