// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import OnboardingTour from "../OnboardingTour";

// jsdom has no ResizeObserver; this stub delivers one measurement per observe()
// the way a real one does for an attached, non-empty element.
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  constructor(private cb: () => void) { FakeResizeObserver.instances.push(this); }
  observe() { queueMicrotask(() => this.cb()); }
  disconnect() {}
}

function addTab(rect: { top: number; bottom: number; left: number; width: number }) {
  const nav = document.createElement("nav");
  const a = document.createElement("a");
  a.setAttribute("data-tour", "recipes");
  a.getBoundingClientRect = () =>
    ({ ...rect, right: rect.left + rect.width, height: rect.bottom - rect.top, x: rect.left, y: rect.top, toJSON() {} }) as DOMRect;
  a.getClientRects = () => [{}] as unknown as DOMRectList;
  nav.appendChild(a);
  document.body.appendChild(nav);
  return nav;
}

describe("OnboardingTour target tracking", () => {
  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    Object.defineProperty(window, "innerHeight", { value: 844, configurable: true });
    Object.defineProperty(window, "innerWidth", { value: 390, configurable: true });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    document.querySelectorAll("nav").forEach((n) => n.remove());
  });

  it("re-finds the tab after the page (and its nav) is replaced mid-navigation", async () => {
    const user = userEvent.setup();
    const oldNav = addTab({ top: 790, bottom: 844, left: 78, width: 78 });
    render(<OnboardingTour onComplete={() => {}} onSkip={() => {}} />);

    await user.click(screen.getByRole("button", { name: /Take the tour/ }));
    const dialog = screen.getByRole("dialog", { name: "Tour step 1 of 4" });
    Object.defineProperty(dialog, "offsetHeight", { value: 180, configurable: true });

    // Simulate Next swapping the page: old nav unmounts, new page's nav mounts
    await act(async () => {
      oldNav.remove();
      await Promise.resolve();
    });
    await act(async () => {
      addTab({ top: 790, bottom: 844, left: 78, width: 78 });
      await new Promise((r) => setTimeout(r, 0)); // MutationObserver + ResizeObserver deliver
    });

    // Positioned above the bottom tab bar, not stuck at 0,0
    expect(dialog.style.top).toBe(`${790 - 12 - 180}px`);
    expect(dialog.style.left).toBe("16px");
  });

  it("measures immediately when the target is already on the page", async () => {
    const user = userEvent.setup();
    addTab({ top: 10, bottom: 50, left: 600, width: 80 });
    Object.defineProperty(window, "innerWidth", { value: 1400, configurable: true });
    render(<OnboardingTour onComplete={() => {}} onSkip={() => {}} />);
    await user.click(screen.getByRole("button", { name: /Take the tour/ }));
    const dialog = screen.getByRole("dialog", { name: "Tour step 1 of 4" });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(dialog.style.top).toBe("62px");
  });
});
