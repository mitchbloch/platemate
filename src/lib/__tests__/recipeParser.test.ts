import { describe, it, expect } from "vitest";
import { assertPublicHttpUrl, isVideoUrl } from "../recipeParser";

describe("assertPublicHttpUrl", () => {
  it("accepts normal public recipe URLs", () => {
    expect(() => assertPublicHttpUrl("https://www.budgetbytes.com/some-recipe/")).not.toThrow();
    expect(() => assertPublicHttpUrl("http://cooking.nytimes.com/recipes/123")).not.toThrow();
  });

  it("rejects non-http(s) protocols", () => {
    expect(() => assertPublicHttpUrl("file:///etc/passwd")).toThrow();
    expect(() => assertPublicHttpUrl("ftp://example.com/x")).toThrow();
    expect(() => assertPublicHttpUrl("javascript:alert(1)")).toThrow();
  });

  it("rejects malformed URLs", () => {
    expect(() => assertPublicHttpUrl("not a url")).toThrow("Invalid URL");
  });

  it("rejects localhost and internal hostnames", () => {
    expect(() => assertPublicHttpUrl("http://localhost:3000/admin")).toThrow();
    expect(() => assertPublicHttpUrl("http://intranet/secrets")).toThrow();
    expect(() => assertPublicHttpUrl("http://db.internal/")).toThrow();
    expect(() => assertPublicHttpUrl("http://printer.local/")).toThrow();
  });

  it("rejects private and reserved IPv4 ranges", () => {
    for (const host of [
      "127.0.0.1",
      "10.0.0.5",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254", // cloud metadata endpoint
      "100.64.0.1",
      "0.0.0.0",
    ]) {
      expect(() => assertPublicHttpUrl(`http://${host}/`), host).toThrow();
    }
  });

  it("allows public IPv4 addresses", () => {
    expect(() => assertPublicHttpUrl("http://93.184.216.34/")).not.toThrow();
    expect(() => assertPublicHttpUrl("http://172.32.0.1/")).not.toThrow(); // just outside 172.16/12
  });

  it("rejects IPv6 loopback and private addresses", () => {
    expect(() => assertPublicHttpUrl("http://[::1]/")).toThrow();
    expect(() => assertPublicHttpUrl("http://[fc00::1]/")).toThrow();
    expect(() => assertPublicHttpUrl("http://[fe80::1]/")).toThrow();
  });
});

describe("isVideoUrl", () => {
  it("detects video platforms", () => {
    expect(isVideoUrl("https://www.tiktok.com/@user/video/123")).toBe(true);
    expect(isVideoUrl("https://youtu.be/abc123")).toBe(true);
    expect(isVideoUrl("https://www.instagram.com/reel/xyz/")).toBe(true);
  });

  it("does not flag lookalike domains", () => {
    expect(isVideoUrl("https://nottiktok.com/video")).toBe(false);
    expect(isVideoUrl("https://www.budgetbytes.com/recipe")).toBe(false);
  });
});
