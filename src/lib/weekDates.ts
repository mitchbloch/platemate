/** Client-side week helpers (local time). The server uses mealPlans.getWeekStart
 *  in America/New_York; on the client the device clock is the right one. */

export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Sunday of the current week, YYYY-MM-DD. */
export function getCurrentWeekStart(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() - d.getDay());
  return toLocalDateString(d);
}
