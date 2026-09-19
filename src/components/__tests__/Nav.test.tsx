// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const state = { pathname: "/", pending: false };

vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
}));
vi.mock("next/link", async () => {
  const React = await import("react");
  const Link = React.forwardRef<HTMLAnchorElement, React.ComponentProps<"a"> & { href: string }>(
    function Link({ href, children, ...rest }, ref) {
      return <a ref={ref} href={href} {...rest}>{children}</a>;
    },
  );
  return { default: Link, useLinkStatus: () => ({ pending: state.pending }) };
});

import Nav from "../Nav";

function mobileTab(label: string) {
  // The bottom bar is the second set of links; scope by aria-current-capable links
  return screen.getAllByRole("link", { name: label }).at(-1)!;
}

describe("Nav", () => {
  beforeEach(() => {
    state.pathname = "/";
    state.pending = false;
  });

  it("marks the current route as active", () => {
    state.pathname = "/plan";
    render(<Nav />);
    expect(mobileTab("Plan")).toHaveAttribute("aria-current", "page");
    expect(mobileTab("Recipes")).not.toHaveAttribute("aria-current");
  });

  it("highlights the tapped tab immediately, before the route changes", async () => {
    const user = userEvent.setup();
    render(<Nav />);
    await user.click(mobileTab("Grocery"));
    expect(mobileTab("Grocery")).toHaveAttribute("aria-current", "page");
    expect(mobileTab("Home")).not.toHaveAttribute("aria-current");
  });

  it("drops the optimistic highlight once the path has moved on", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Nav />);
    await user.click(mobileTab("Grocery"));
    // Navigation landed somewhere else (e.g. a redirect or browser back)
    state.pathname = "/recipes";
    rerender(<Nav />);
    expect(mobileTab("Recipes")).toHaveAttribute("aria-current", "page");
    expect(mobileTab("Grocery")).not.toHaveAttribute("aria-current");
  });

  it("shows a pending state while a link navigation is in flight", () => {
    state.pending = true;
    render(<Nav />);
    expect(mobileTab("Plan").querySelector("[data-pending='true']")).not.toBeNull();
  });

  it("gives every bottom tab a 44px minimum hit area", () => {
    render(<Nav />);
    expect(mobileTab("Plan").className).toContain("min-h-11");
  });
});
