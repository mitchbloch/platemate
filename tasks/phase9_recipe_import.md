# Phase 9: Recipe Import Pipeline + Screenshot Import

> Spec agreed 2026-11-01 after a live audit of every import source (TikTok, YouTube,
> Instagram, Pinterest, 13 recipe sites) and a design review. One PR into `main`
> from `feature/recipe-import-pipeline`. No migrations.

## Root causes found during the audit

| Symptom | Root cause | Where |
| --- | --- | --- |
| Every TikTok link says "paste the recipe text instead" (user report: `tiktok.com/t/ZPLPoL8uG/`) | Since ~2026-10-19, TikTok's oEmbed returns no `title` (caption) or `author_name` for any video. We treat a missing caption as "nothing to extract". The caption is still served on the public video page in the `__UNIVERSAL_DATA_FOR_REHYDRATION__` JSON (`webapp.video-detail` → `itemInfo.itemStruct.desc`) | `extractVideoContent` |
| Website imports silently drop the end of the ingredient list | `fetchRecipeHtml` strips **every** `<script>`, including the schema.org Recipe JSON-LD the prompt tells Claude to prefer. The remaining HTML is cut at 60k characters. Measured: BBC Good Food lost 3/3 of the last ingredients, Bon Appétit 2/3. JSON-LD is 4–45k chars where cleaned HTML is 93–261k | `fetchRecipeHtml` |
| YouTube recipes come in thin | Reads the 160-char `og:description`. The page's `ytInitialPlayerResponse.videoDetails.shortDescription` had 2,112 chars, and an ASR caption track is listed | `extractVideoContent` |
| ~40% of sites fail with "Failed to fetch recipe page: 403" (HTTP 500) | Cloudflare managed challenges (Budget Bytes, Half Baked Harvest, Cookie and Kate) and People Inc's licensing block, a 402 (AllRecipes, Serious Eats), are treated as server errors. The user is never moved to paste mode | `parse/route.ts` |
| TikTok author never shown | The route passes only the text to Claude and discards `extracted.sourceName` | `parse/route.ts` |
| SSRF guard only checks the first URL | `redirect: "follow"`, so a public URL that redirects to a private address is fetched | `fetchRecipeHtml`, `resolveRedirect` |
| `vt.tiktok.com` links and Pinterest pins unhandled | Host list gaps. A pin's page carries the outbound recipe URL (`"link"`) | `PLATFORM_HOSTNAMES` |
| Platform detection duplicated | Regex in `RecipeForm` | `RecipeForm.tsx` |
| HTML entities in meta descriptions reach Claude raw | `extractMetaDescription` doesn't decode | `recipeParser.ts` |

Not reachable: production runtime logs (Vercel MCP and CLI both return 403 for this team). The oEmbed change is TikTok-side and reproduces from any IP.

## Decisions locked

| # | Decision | Choice | Why |
| --- | --- | --- | --- |
| 1 | TikTok source | Read the public video page once per link the user pastes, like a link preview. No crawling, no evasion. A block falls back to paste/screenshots | oEmbed no longer carries the caption, and there is no official caption API without the creator's OAuth. TikTok's Terms prohibit automated extraction. Accepted as a grey area for one user-initiated fetch |
| 2 | Transcripts | Always include the auto-generated (ASR) transcript: TikTok `video.subtitleInfos` WebVTT, YouTube `captionTracks`. Sent with the caption in the same single Claude call. Best-effort with its own short timeout | Many recipes are spoken, not written |
| 3 | Blocked sites | Clear fallback only: explain the site blocks automated import, switch to Paste Text with the URL kept as the source, offer screenshots. Never bypass challenges | Respect the block. Screenshots make the fallback quick |
| 4 | Drift detection | `npm run eval:import`: a manual live script, one real URL per source, pass/fail per stage. Extraction-only by default, `--parse` adds Claude | TikTok broke silently. The next change should be caught by a script, not by a user |
| 5 | Request identity | Keep the browser User-Agent (NYT Cooking and BBC Good Food return 404 to an honest `Platemate/1.0` UA; TikTok, YouTube and Pinterest don't care). Hard limits: one fetch per user-pasted link, never retry under a different identity, never solve challenges, never set consent cookies | User's call (2026-11-01), made after weighing NYT auto-import against transparency |
| 6 | Screenshot import | Same PR. Up to 5 screenshots/photos in Paste Text mode, with or without text, read in the same single Claude call. Downscaled client-side to 1568px (text stays legible). Never stored | Covers Instagram, blocked sites, cookbooks, recipe cards. Reuses the generation chat's downscale |
| 7 | Extraction model | Deterministic extraction first (JSON-LD, page JSON, transcript), then **one** Claude call to normalize (`shoppingName`, categories, enums, nutrition fill-in). Site-provided nutrition is used as given | JSON-LD has no `shoppingName`/categories and usually no cholesterol/sat fat. One call keeps latency and cost flat |
| 8 | No recipe in the source | Prompt returns empty `ingredients` when the content has no recipe ("recipe in bio"). The existing `validateParsedRecipe` check maps that to a 422 `no_recipe` | The text prompt otherwise invents a recipe from a dish name |
| 9 | Time budget | One deadline per request (route `maxDuration` 60s): extraction ≤ 15s total including any Pinterest hop, transcript ≤ 4s, Claude gets the remainder minus 3s | An opaque Vercel 504 is the worst failure mode |
| 10 | Images from sources | JSON-LD/og image as-is. YouTube → stable `i.ytimg.com/vi/<id>/hqdefault.jpg`. TikTok cover **not** stored (signed URL expires in days) | Broken images in the library |

Routine calls made without asking: tracking params (`utm_*`, `si`, `igsh`, `_t`, `_r`, `is_from_webapp`) are stripped from the saved source URL. Pinterest follows exactly one hop. YouTube transcripts are capped at ~20k chars after the description. The page-text fallback (no JSON-LD) is cut at 60k chars of *text* (tags removed), not HTML. A JSON-LD vs. parsed ingredient-count mismatch logs a warning.

---

## Design

`src/lib/import/`. Only TikTok and YouTube warrant their own files; resolvers that just produce another URL stay small in `index.ts`.

| File | Responsibility |
| --- | --- |
| `platforms.ts` | Client-safe, pure. `detectSource(url)` → `tiktok \| youtube \| instagram \| pinterest \| web` (TikTok `www./m./vm./vt.`, YouTube `www./m./music./youtu.be/youtube-nocookie`, `instagram.com`, `pin.it` + `*.pinterest.*`). `stripTracking(url)`. Used by the server and `RecipeForm` |
| `fetchPage.ts` | `assertPublicHttpUrl` (moved; adds IPv4-mapped IPv6, `0.0.0.0/8`) plus a per-hop DNS private-address check. `ImportFailure` (`blocked`, `login_required`, `not_found`, `no_recipe`, `unsupported`, `fetch_failed`) with user-facing messages. `createDeadline`. `fetchPage(url, { deadline, maxBytes, accept })`: manual redirects (≤5, relative `Location`, loop detection, credentials-in-URL rejected), streamed size cap on decompressed bytes, charset decoding, content-type check, status mapping (404/410 → `not_found`; 401 → `login_required`; 402/403/429/503 or challenge markers on any status → `blocked`) |
| `text.ts` | `decodeEntities`, `htmlToText`, `extractMeta`, `vttToText` (dedupes rolling cues), `extractEmbeddedJson(html, marker)` (string-aware brace scanner) |
| `jsonLd.ts` | `extractRecipeJsonLd(html, pageUrl)`: every `ld+json` block parsed on its own; `@graph`, `@type` string/array/`schema:Recipe`, `mainEntity`, `ItemList`; picks the recipe whose `url` matches the page, else most ingredients; empty ingredients/instructions = absent; entity/tag cleanup inside strings; absolute `image`; pruned to recipe fields |
| `tiktok.ts` | Resolve the short link → rehydration JSON → `statusCode`, `desc`, `author` → ASR VTT (original language preferred). Photo posts are caption only |
| `youtube.ts` | `ytInitialPlayerResponse` → description, title, author, ASR caption track. Consent redirect or non-OK playability → oEmbed + `og:description`. Empty timedtext → no transcript |
| `index.ts` | `extractImportSource(url, deadline)` → `ImportSource { sections: { label, text }[]; images: string[]; sourceName; imageUrl; sourceUrl }`. Web: JSON-LD, else page text. Pinterest: follow the outbound `link` once, else the pin's own `articleBody`. Instagram: Brave cross-post lookup, else `login_required` |

`recipeParser.ts` becomes Claude call + validation only. It has one system prompt (HTML and text prompts merged so they can't drift). `parseRecipe(source, deadline)` sends image blocks first, then labeled sections (`STRUCTURED DATA`, `CAPTION`, `TRANSCRIPT`, `PAGE TEXT`, `USER TEXT`). The adapter's `sourceName`/`imageUrl` override Claude's. Empty ingredients → `ImportFailure("no_recipe")`.

### API contract

- `POST /api/recipes/parse { url }` returns 200 with a `ParsedRecipe`, or **422** `{ error, reason, canPaste: true, sourceUrl }` for any `ImportFailure`. 400 for bad input, 500 only for genuine server faults.
- `POST /api/recipes/parse-text { text?, images?, sourceUrl? }` needs text or at least one image (≤5, each within the shared base64 cap). Same 422 mapping (`no_recipe`).
- One structured log line per import: `[import] { source, outcome, reason, stage, ms }`.

### UI (`RecipeForm`)

- Paste Text mode gains **Add screenshots**: thumbnails with remove, up to 5. Text is optional when images are attached.
- On a 422 from URL import: switch to Paste Text, keep the URL in "Source URL", and show a reason-specific message:
  - `blocked` — "This site doesn't allow automatic import."
  - `login_required` — "This post is private or needs a login."
  - `not_found` — "That post or page wasn't found."
  - `no_recipe` — "Couldn't find a recipe there."

  Each message ends with "Paste the recipe text or add screenshots."
- Spinner copy uses `detectSource` (no regex).

---

## Test plan

Synthetic fixtures modeled on real page shapes, not copyrighted page dumps. The fixture README notes each shape and the capture date (2026-11-01).

- **platforms:** every host and URL shape, lookalike domains, tracking strip.
- **fetchPage** (stubbed `fetch` + DNS):
  - Redirects: a private IP on a later hop, relative `Location`, a loop, more than 5 hops, credentials in the URL.
  - Body: oversize stream, windows-1252 body, PDF/image rejection.
  - Blocks: a challenge page served with 200, plus 402, 403 and 404.
  - Deadline abort.
  - Addresses: IPv6-mapped loopback, a hostname that resolves to a private address.
- **text:** entities incl. fractions, meta entities (regression), VTT dedupe, embedded JSON containing `};` inside strings.
- **jsonLd:** `@graph`, type arrays, `schema:Recipe`, a malformed block next to a valid one, two recipes, empty ingredients, HTML inside strings, image shapes. A page whose JSON-LD ingredients sit past the old 60k cut (regression).
- **tiktok / youtube:**
  - Success.
  - Failure states: non-zero `statusCode`, missing scope, consent redirect, empty timedtext.
  - Limits: a slow transcript still returns the caption.
  - Photo post.
  - The TikTok author reaches `sourceName` (regression).
- **parseRecipe** (captured request): image blocks first, labeled sections, adapter `sourceName` wins, empty ingredients → `no_recipe`.
- **Routes:** 422 body per reason, text-or-images validation, too many or oversize images rejected.
- **RecipeForm** (jsdom):
  - A 422 switches mode and keeps the URL.
  - Reason-specific copy.
  - Adding and removing screenshots.
  - Submitting with images only.

## Verification

1. `npm run test`, `npm run lint`, `npm run build`.
2. `npm run eval:import -- --parse` against live sources (a few cents). The user's link should yield "High Protein Sheetpan Chicken Kebabs", "TikTok — Panacea Palm", with the garlic sauce and salad sub-lists.
3. Local dev in the browser pane: TikTok link, NYT recipe, a blocked site (fallback flow), 2 screenshots → save.
4. Draft PR → Vercel preview (datacenter IPs): TikTok link, a YouTube Short, an NYT recipe. Then mark ready.
