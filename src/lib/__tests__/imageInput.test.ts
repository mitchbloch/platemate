import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BASE64_CHARS, validateBase64Images } from "../imageInput";

describe("validateBase64Images", () => {
  it("treats a missing field as no images", () => {
    expect(validateBase64Images(undefined, 5, "screenshot")).toEqual({ ok: true, images: [] });
    expect(validateBase64Images(null, 5, "screenshot")).toEqual({ ok: true, images: [] });
  });

  it("accepts base64 strings up to the count and size caps", () => {
    const img = "A".repeat(MAX_IMAGE_BASE64_CHARS - 2) + "==";
    expect(validateBase64Images([img, "/9j/4AAQ"], 5, "screenshot")).toEqual({ ok: true, images: [img, "/9j/4AAQ"] });
  });

  it("rejects too many, oversize, empty, non-string, non-base64 and non-array input", () => {
    expect(validateBase64Images(["a", "b", "c"], 2, "photo")).toEqual({ ok: false, error: "Up to 2 photos" });
    expect(validateBase64Images(["A".repeat(MAX_IMAGE_BASE64_CHARS + 1)], 5, "screenshot")).toEqual({
      ok: false,
      error: "A screenshot is too large — try a smaller one",
    });
    for (const bad of [[""], [42], ["data:image/jpeg;base64,AAAA"], ["<script>"]]) {
      expect(validateBase64Images(bad, 5, "screenshot"), JSON.stringify(bad)).toEqual({ ok: false, error: "Screenshots must be base64 JPEG" });
    }
    expect(validateBase64Images("AAAA", 5, "screenshot")).toEqual({ ok: false, error: "Screenshots must be a list" });
  });
});
