import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

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
  not_found: "That post or page wasn't found.",
  no_recipe: "Couldn't find a recipe there.",
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

// ── Time budget ──

/** One budget for a whole request, so extraction + Claude fit maxDuration */
export interface Deadline {
  signal: AbortSignal;
  remainingMs(): number;
}

export function createDeadline(ms: number): Deadline {
  const end = Date.now() + ms;
  return { signal: AbortSignal.timeout(ms), remainingMs: () => Math.max(0, end - Date.now()) };
}

/** A tighter sub-budget (e.g. a best-effort transcript) inside a deadline */
export function subDeadline(parent: Deadline, ms: number): Deadline {
  const capped = Math.min(ms, parent.remainingMs());
  const end = Date.now() + capped;
  return {
    signal: AbortSignal.any([parent.signal, AbortSignal.timeout(capped)]),
    remainingMs: () => Math.max(0, end - Date.now()),
  };
}

// ── SSRF guard ──

function isPrivateIPv4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(ip: string): boolean {
  const addr = ip.toLowerCase();
  if (addr === "::" || addr === "::1") return true;
  // IPv4-mapped (::ffff:127.0.0.1, or the normalized hex form ::ffff:7f00:1)
  const mapped = addr.match(/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/);
  if (mapped) {
    if (mapped[1]) return isPrivateIPv4(mapped[1]);
    const hi = parseInt(mapped[2], 16);
    const lo = parseInt(mapped[3], 16);
    return isPrivateIPv4(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  const first = parseInt(addr.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 unique-local
    (first & 0xffc0) === 0xfe80 || // fe80::/10 link-local
    (first & 0xff00) === 0xff00 // ff00::/8 multicast
  );
}

export function isPrivateAddress(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return false;
}

/** Reject URLs that don't point at a public http(s) host (SSRF guard).
 *  Synchronous: checks the URL itself. `fetchPage` also resolves DNS. */
export function assertPublicHttpUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http(s) URLs are supported");
  }
  if (parsed.username || parsed.password) {
    throw new Error("URLs with credentials are not allowed");
  }

  // URL normalizes IPv4 shorthands (2130706433, 0x7f.1) to dotted form
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");

  // Internal hostnames: localhost, single-label names, .local/.internal
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    (!host.includes(".") && !host.includes(":")) ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    throw new Error("URL host is not allowed");
  }
  if (isPrivateAddress(host)) {
    throw new Error("URL host is not allowed");
  }

  return parsed;
}

/** Resolve the hostname and reject it if any address is private (catches
 *  public names pointing inward, e.g. 127.0.0.1.nip.io). A DNS-rebinding
 *  race between this lookup and fetch's own remains; acceptable here since
 *  the function has no privileged network position worth reaching. */
async function assertPublicHost(hostname: string): Promise<void> {
  const host = hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return; // literals already checked synchronously
  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    throw new ImportFailure("fetch_failed", `DNS lookup failed for ${host}`);
  }
  if (addresses.some((a) => isPrivateAddress(a.address))) {
    throw new ImportFailure("unsupported", `${host} resolves to a private address`);
  }
}

// ── Fetch ──

// A browser identity: NYT Cooking and BBC Good Food 404 an honest UA.
// Decision 5 in tasks/phase9_recipe_import.md: exactly one fetch per link
// the user pasted, never retried under another identity, challenges never
// solved — a block is reported, not worked around.
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MAX_REDIRECTS = 5;
const DEFAULT_MAX_BYTES = 4_000_000; // YouTube watch pages run ~2MB

const BINARY_CONTENT_TYPE = /^(image|video|audio|font)\/|^application\/(pdf|zip|octet-stream)/i;

// Bot challenges served with any status (Cloudflare often uses 403/503, but
// a 200 challenge page is possible). Not `/cdn-cgi/challenge-platform/`:
// Cloudflare injects that script into ordinary pages too.
const CHALLENGE_MARKERS = [/_cf_chl_opt/, /<title>\s*Just a moment\.\.\.\s*<\/title>/i];

export interface FetchedPage {
  /** Final URL after redirects */
  url: string;
  status: number;
  contentType: string;
  text: string;
}

export interface FetchPageOptions {
  deadline: Deadline;
  maxBytes?: number;
  accept?: string;
  /** Skip the binary content-type rejection, for CDNs that mislabel text
   *  (TikTok serves WebVTT as video/mp4). Caller must validate the body. */
  ignoreContentType?: boolean;
}

function failureForStatus(status: number): ImportFailure | null {
  if (status === 404 || status === 410) return new ImportFailure("not_found", `HTTP ${status}`);
  if (status === 401) return new ImportFailure("login_required", `HTTP ${status}`);
  if (status === 402 || status === 403 || status === 429 || status === 503) {
    return new ImportFailure("blocked", `HTTP ${status}`);
  }
  if (status >= 400) return new ImportFailure("fetch_failed", `HTTP ${status}`);
  return null;
}

function charsetOf(contentType: string, head: Uint8Array): string {
  const fromHeader = contentType.match(/charset=["']?([\w-]+)/i)?.[1];
  if (fromHeader) return fromHeader;
  // Sniff <meta charset> / http-equiv in the first 2KB (ASCII-safe)
  const prefix = new TextDecoder("latin1").decode(head.subarray(0, 2048));
  return prefix.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8";
}

function decode(bytes: Uint8Array, contentType: string): string {
  try {
    return new TextDecoder(charsetOf(contentType, bytes)).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes); // unknown label
  }
}

/** Read at most maxBytes of the (already decompressed) body. Over the cap
 *  we keep the head rather than fail: recipe data sits early in the page. */
async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < maxBytes) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  if (total >= maxBytes) await reader.cancel().catch(() => {});
  const out = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    const take = Math.min(chunk.byteLength, out.byteLength - offset);
    out.set(chunk.subarray(0, take), offset);
    offset += take;
    if (offset >= out.byteLength) break;
  }
  return out;
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

/** GET a public page: SSRF-checked on every redirect hop, bounded in time
 *  and size, decoded with the right charset, blocks reported as failures. */
export async function fetchPage(url: string, options: FetchPageOptions): Promise<FetchedPage> {
  const {
    deadline,
    maxBytes = DEFAULT_MAX_BYTES,
    accept = "text/html,application/xhtml+xml",
    ignoreContentType = false,
  } = options;
  const visited = new Set<string>();
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let parsed: URL;
    try {
      parsed = assertPublicHttpUrl(current);
    } catch (err) {
      throw new ImportFailure("unsupported", err instanceof Error ? err.message : String(err));
    }
    await assertPublicHost(parsed.hostname);
    visited.add(parsed.toString());

    let res: Response;
    try {
      res = await fetch(parsed, {
        redirect: "manual",
        signal: deadline.signal,
        headers: { "User-Agent": USER_AGENT, Accept: accept, "Accept-Language": "en-US,en;q=0.9" },
      });
    } catch (err) {
      throw new ImportFailure("fetch_failed", isAbort(err) ? "timed out" : String(err));
    }

    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      const location = res.headers.get("location");
      if (!location) throw new ImportFailure("fetch_failed", `HTTP ${res.status} without Location`);
      const next = new URL(location, parsed).toString();
      if (visited.has(next)) throw new ImportFailure("fetch_failed", "redirect loop");
      current = next;
      continue;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!ignoreContentType && BINARY_CONTENT_TYPE.test(contentType)) {
      await res.body?.cancel().catch(() => {});
      throw new ImportFailure("unsupported", `content-type ${contentType}`);
    }

    let bytes: Uint8Array;
    try {
      bytes = await readCapped(res, maxBytes);
    } catch (err) {
      throw new ImportFailure("fetch_failed", isAbort(err) ? "timed out reading body" : String(err));
    }
    const text = decode(bytes, contentType);

    if (CHALLENGE_MARKERS.some((m) => m.test(text))) {
      throw new ImportFailure("blocked", `bot challenge (HTTP ${res.status})`);
    }
    const statusFailure = failureForStatus(res.status);
    if (statusFailure) throw statusFailure;

    return { url: parsed.toString(), status: res.status, contentType, text };
  }

  throw new ImportFailure("fetch_failed", "too many redirects");
}
