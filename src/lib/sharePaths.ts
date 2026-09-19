/** Client-safe helpers for share links (no server imports). */

export function sharePath(token: string): string {
  return `/r/${token}`;
}

/** Tokens are base64url of 16 bytes (22 chars); reject anything else before
 *  it reaches the database. */
export function isValidShareToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{16,64}$/.test(token);
}
