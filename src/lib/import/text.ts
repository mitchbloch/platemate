/** Text helpers for turning fetched pages, captions and transcripts into
 *  clean prompt text. Pure; no DOM (runs in serverless functions). */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  frac12: "½", frac14: "¼", frac34: "¾", frac13: "⅓", frac23: "⅔", frac18: "⅛", frac38: "⅜", frac58: "⅝", frac78: "⅞",
  deg: "°", times: "×", ndash: "–", mdash: "—", hellip: "…", bull: "•", middot: "·",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”", laquo: "«", raquo: "»",
  eacute: "é", egrave: "è", ecirc: "ê", aacute: "á", agrave: "à", acirc: "â", iacute: "í", oacute: "ó",
  uacute: "ú", ntilde: "ñ", ccedil: "ç", auml: "ä", ouml: "ö", uuml: "ü", szlig: "ß", reg: "®", trade: "™", copy: "©",
};

function decodeOnce(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** Decode HTML entities. Runs twice so double-encoded CMS output
 *  (`&amp;#39;`) comes out clean; unknown entities are left alone. */
export function decodeEntities(text: string): string {
  return decodeOnce(decodeOnce(text));
}

const BLOCK_TAGS = "p|div|section|article|li|ul|ol|h[1-6]|tr|table|blockquote|figure|figcaption|dd|dt|pre";

/** Readable text from HTML: drops scripts, styles, navigation and
 *  chrome; block elements become line breaks, list items get bullets. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template|svg|iframe|nav|header|footer|aside|form)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li\b[^>]*>/gi, "\n- ")
      .replace(new RegExp(`</?(?:${BLOCK_TAGS})\\b[^>]*>`, "gi"), "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter((line, i, lines) => line !== "" || (i > 0 && lines[i - 1] !== ""))
    .join("\n")
    .trim();
}

/** Strip tags and collapse whitespace in a short string (JSON-LD values) */
export function cleanInlineText(text: string): string {
  return decodeEntities(text.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}

/** Content of a <meta property|name="key">, entity-decoded. Attribute
 *  order and quote style don't matter, and apostrophes inside a
 *  double-quoted value survive (the old regex cut "Grandma's" at the '). */
export function extractMeta(html: string, key: string): string | null {
  const wanted = key.toLowerCase();
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(tag);
    if ((attrs.property ?? attrs.name ?? attrs.itemprop)?.toLowerCase() === wanted && attrs.content !== undefined) {
      return decodeEntities(attrs.content).trim() || null;
    }
  }
  return null;
}

/** Plain text from a WebVTT transcript. Auto-captions repeat each line
 *  as it scrolls, so consecutive duplicates are dropped. */
export function vttToText(vtt: string): string {
  const lines: string[] = [];
  let inNote = false;
  for (const raw of vtt.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (line === "") {
      inNote = false;
      continue;
    }
    if (inNote || line.startsWith("WEBVTT") || line.includes("-->") || /^\d+$/.test(line)) continue;
    if (line.startsWith("NOTE") || line.startsWith("STYLE") || line.startsWith("REGION")) {
      inNote = true;
      continue;
    }
    const text = cleanInlineText(line.replace(/<\d{2}:\d{2}[:.\d]*>/g, ""));
    if (text && text !== lines[lines.length - 1]) lines.push(text);
  }
  return lines.join("\n");
}

/** Parse the JSON object that starts at the first `{` after a marker.
 *  String-aware brace matching, so a `};` inside a caption or
 *  description can't end the object early. Tries every marker match;
 *  returns null if none parse. */
export function extractEmbeddedJson(html: string, marker: RegExp): unknown {
  const pattern = new RegExp(marker.source, marker.flags.includes("g") ? marker.flags : marker.flags + "g");
  for (const match of html.matchAll(pattern)) {
    const start = html.indexOf("{", match.index + match[0].length - 1);
    if (start === -1) continue;
    let depth = 0;
    let inString = false;
    for (let i = start; i < html.length; i++) {
      const ch = html[i];
      if (inString) {
        if (ch === "\\") i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}" && --depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          break; // malformed — try the next marker match
        }
      }
    }
  }
  return null;
}
