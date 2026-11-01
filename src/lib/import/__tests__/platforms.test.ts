import { describe, it, expect } from "vitest";
import { detectSource, isVideoSource, stripTracking } from "../platforms";

describe("detectSource", () => {
  it.each([
    ["https://www.tiktok.com/@panaceapalm/video/7641621946563661078", "tiktok"],
    ["https://www.tiktok.com/t/ZPLPoL8uG/", "tiktok"],
    ["https://tiktok.com/@user/photo/123", "tiktok"],
    ["https://vm.tiktok.com/ZMabc/", "tiktok"],
    ["https://vt.tiktok.com/ZSabc/", "tiktok"], // regression: missing from the old host list
    ["https://m.tiktok.com/v/123.html", "tiktok"],
    ["https://www.youtube.com/watch?v=abc", "youtube"],
    ["https://youtube.com/shorts/8j5Z9IHEAj8", "youtube"],
    ["https://m.youtube.com/watch?v=abc", "youtube"],
    ["https://music.youtube.com/watch?v=abc", "youtube"],
    ["https://youtu.be/abc", "youtube"],
    ["https://www.youtube-nocookie.com/embed/abc", "youtube"],
    ["https://www.instagram.com/reel/DCt9t_QSvOc/", "instagram"],
    ["https://instagram.com/p/abc/", "instagram"],
    ["https://www.pinterest.com/pin/115334440443527182/", "pinterest"],
    ["https://at.pinterest.com/pin/52143308180771815/", "pinterest"],
    ["https://www.pinterest.co.uk/pin/1/", "pinterest"],
    ["https://pin.it/abc123", "pinterest"],
    ["https://cooking.nytimes.com/recipes/1018520-french-onion-soup", "web"],
    ["https://stealthhealthlife.substack.com/p/tikka", "web"],
  ])("%s → %s", (url, expected) => {
    expect(detectSource(url)).toBe(expected);
  });

  it("does not match lookalike domains", () => {
    expect(detectSource("https://nottiktok.com/video")).toBe("web");
    expect(detectSource("https://tiktok.com.evil.example/x")).toBe("web");
    expect(detectSource("https://myyoutube.com/watch")).toBe("web");
    expect(detectSource("https://pinterest.evil.com/pin/1")).toBe("web");
    expect(detectSource("https://notpin.it/x")).toBe("web");
  });

  it("treats malformed URLs as web (validation happens server-side)", () => {
    expect(detectSource("not a url")).toBe("web");
    expect(detectSource("")).toBe("web");
  });

  it("is case-insensitive on the host", () => {
    expect(detectSource("https://WWW.TikTok.com/@u/video/1")).toBe("tiktok");
  });
});

describe("isVideoSource", () => {
  it("is true only for video platforms", () => {
    expect(isVideoSource("https://vt.tiktok.com/x/")).toBe(true);
    expect(isVideoSource("https://youtu.be/x")).toBe(true);
    expect(isVideoSource("https://www.instagram.com/reel/x/")).toBe(true);
    expect(isVideoSource("https://pin.it/x")).toBe(false);
    expect(isVideoSource("https://www.budgetbytes.com/x")).toBe(false);
  });
});

describe("stripTracking", () => {
  it("removes tracking params and keeps meaningful ones", () => {
    expect(stripTracking("https://www.tiktok.com/@u/video/1?_r=1&_t=ZP-9B&is_from_webapp=1")).toBe(
      "https://www.tiktok.com/@u/video/1",
    );
    expect(stripTracking("https://www.youtube.com/watch?v=abc&si=xyz&t=30")).toBe(
      "https://www.youtube.com/watch?v=abc&t=30",
    );
    expect(stripTracking("https://site.com/r?utm_source=pinterest&utm_medium=social&id=5")).toBe(
      "https://site.com/r?id=5",
    );
    expect(stripTracking("https://www.instagram.com/reel/x/?igsh=abc")).toBe("https://www.instagram.com/reel/x/");
  });

  it("leaves a clean URL unchanged", () => {
    expect(stripTracking("https://cooking.nytimes.com/recipes/1")).toBe("https://cooking.nytimes.com/recipes/1");
  });

  it("returns malformed input as-is", () => {
    expect(stripTracking("not a url")).toBe("not a url");
  });
});
