/** Base64 JPEG images sent from the browser — generation chat photos and
 *  import screenshots. Pure and client-safe: limits are shared with the UI. */

/** ~600KB of JPEG. Five at the cap stay under Vercel's 4.5MB request body. */
export const MAX_IMAGE_BASE64_CHARS = 800_000;

/** Screenshots per import (a long caption or recipe card can take several) */
export const MAX_IMPORT_SCREENSHOTS = 5;

const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Validate an untrusted `images` field: absent → [], else at most `max`
 *  non-empty base64 strings within the size cap. */
export function validateBase64Images(
  value: unknown,
  max: number,
  noun: string,
): { ok: true; images: string[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, images: [] };
  const pluralLabel = `${noun[0].toUpperCase()}${noun.slice(1)}s`;
  if (!Array.isArray(value)) return { ok: false, error: `${pluralLabel} must be a list` };
  if (value.length > max) return { ok: false, error: `Up to ${max} ${noun}s` };
  for (const img of value) {
    if (typeof img !== "string" || !BASE64.test(img)) {
      return { ok: false, error: `${pluralLabel} must be base64 JPEG` };
    }
    if (img.length > MAX_IMAGE_BASE64_CHARS) return { ok: false, error: `A ${noun} is too large — try a smaller one` };
  }
  return { ok: true, images: value as string[] };
}
