import { describe, expect, it } from "vitest";
import { positionTooltip } from "../OnboardingTour";

const phone = { width: 320, height: 180, viewportWidth: 390, viewportHeight: 844 };

describe("positionTooltip", () => {
  it("sits below a target near the top of the screen (desktop top nav)", () => {
    const pos = positionTooltip({ top: 10, bottom: 50, left: 600, width: 80 }, { ...phone, viewportWidth: 1400 });
    expect(pos.top).toBe(62);
    expect(pos.left).toBe(480);
  });

  it("flips above a bottom-tab-bar target instead of rendering off-screen", () => {
    // Mobile: the tour targets are the fixed bottom tab bar
    const target = { top: 790, bottom: 844, left: 78, width: 78 };
    const pos = positionTooltip(target, phone);
    expect(pos.top).toBe(790 - 12 - 180);
    expect(pos.top + phone.height).toBeLessThanOrEqual(target.top);
  });

  it("keeps the card inside the horizontal viewport padding", () => {
    const leftTab = positionTooltip({ top: 790, bottom: 844, left: 0, width: 78 }, phone);
    expect(leftTab.left).toBe(16);
    const rightTab = positionTooltip({ top: 790, bottom: 844, left: 312, width: 78 }, phone);
    expect(rightTab.left).toBe(390 - 16 - 320);
  });

  it("never goes above the top padding even for a tall card", () => {
    const pos = positionTooltip({ top: 100, bottom: 844, left: 0, width: 390 }, { ...phone, height: 900 });
    expect(pos.top).toBe(16);
  });
});
