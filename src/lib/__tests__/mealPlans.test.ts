import { describe, it, expect } from "vitest";
import { getWeekStart } from "../mealPlans";

// getWeekStart must compute the week in Eastern time regardless of the
// server timezone (Vercel runs in UTC). These instants are fixed so the
// assertions hold no matter where the test runs.
describe("getWeekStart", () => {
  it("returns the same Sunday for a mid-week date", () => {
    // Wed 2026-07-08 12:00 ET (16:00 UTC)
    expect(getWeekStart(new Date("2026-07-08T16:00:00Z"))).toBe("2026-07-05");
  });

  it("returns the date itself on a Sunday", () => {
    // Sun 2026-07-05 12:00 ET
    expect(getWeekStart(new Date("2026-07-05T16:00:00Z"))).toBe("2026-07-05");
  });

  it("stays on the current week late Saturday evening Eastern (UTC is already Sunday)", () => {
    // Sat 2026-07-11 21:00 ET = Sun 2026-07-12 01:00 UTC — the regression
    // that showed next week's plan every evening after 8pm Eastern
    expect(getWeekStart(new Date("2026-07-12T01:00:00Z"))).toBe("2026-07-05");
  });

  it("rolls to the new week at midnight Eastern, not midnight UTC", () => {
    // Sun 2026-07-12 00:30 ET = 04:30 UTC
    expect(getWeekStart(new Date("2026-07-12T04:30:00Z"))).toBe("2026-07-12");
  });

  it("handles the spring-forward DST week", () => {
    // DST starts Sun 2026-03-08. Wed 2026-03-11 12:00 ET (16:00 UTC).
    expect(getWeekStart(new Date("2026-03-11T16:00:00Z"))).toBe("2026-03-08");
  });

  it("handles the fall-back DST week", () => {
    // DST ends Sun 2026-11-01. Sat 2026-11-07 22:00 ET (03:00 UTC next day).
    expect(getWeekStart(new Date("2026-11-08T03:00:00Z"))).toBe("2026-11-01");
  });

  it("handles year boundaries", () => {
    // Thu 2026-01-01 12:00 ET — week started Sun 2025-12-28
    expect(getWeekStart(new Date("2026-01-01T17:00:00Z"))).toBe("2025-12-28");
  });
});
