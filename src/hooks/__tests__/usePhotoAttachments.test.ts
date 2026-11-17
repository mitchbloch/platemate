// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const downscale = vi.hoisted(() => ({ calls: [] as { name: string; maxEdge?: number }[], fail: new Set<string>() }));
vi.mock("@/lib/imageDownscale", () => ({
  downscaleToJpegBase64: async (file: File, maxEdge?: number) => {
    downscale.calls.push({ name: file.name, maxEdge });
    if (downscale.fail.has(file.name)) throw new Error("bad image");
    return btoa(file.name);
  },
}));

import { usePhotoAttachments } from "../usePhotoAttachments";

const file = (name: string) => new File(["x"], name, { type: "image/png" });

beforeEach(() => {
  downscale.calls = [];
  downscale.fail = new Set();
});

describe("usePhotoAttachments", () => {
  it("downscales at the requested size and exposes previews", async () => {
    const { result } = renderHook(() => usePhotoAttachments(5, 1568));
    let problem: unknown;
    await act(async () => {
      problem = await result.current.add([file("a.png"), file("b.png")]);
    });
    expect(problem).toBeNull();
    expect(downscale.calls).toEqual([{ name: "a.png", maxEdge: 1568 }, { name: "b.png", maxEdge: 1568 }]);
    expect(result.current.photos.map((p) => p.base64)).toEqual([btoa("a.png"), btoa("b.png")]);
    expect(result.current.photos[0].preview).toBe(`data:image/jpeg;base64,${btoa("a.png")}`);
  });

  it("keeps only as many as fit and reports too_many", async () => {
    const { result } = renderHook(() => usePhotoAttachments(2));
    let problem: unknown;
    await act(async () => {
      problem = await result.current.add([file("a.png"), file("b.png"), file("c.png")]);
    });
    expect(problem).toBe("too_many");
    expect(result.current.photos).toHaveLength(2);
    expect(result.current.full).toBe(true);
  });

  it("never exceeds the cap across two quick picks", async () => {
    const { result } = renderHook(() => usePhotoAttachments(2));
    await act(async () => {
      await Promise.all([result.current.add([file("a.png")]), result.current.add([file("b.png"), file("c.png")])]);
    });
    expect(result.current.photos).toHaveLength(2);
    expect(downscale.calls).toHaveLength(2);
  });

  it("reports unreadable images and attaches none from that pick", async () => {
    downscale.fail.add("bad.heic");
    const { result } = renderHook(() => usePhotoAttachments(5));
    let problem: unknown;
    await act(async () => {
      problem = await result.current.add([file("ok.png"), file("bad.heic")]);
    });
    expect(problem).toBe("unreadable");
    expect(result.current.photos).toHaveLength(0);
    // the freed slots are usable again
    await act(async () => {
      await result.current.add([file("ok.png")]);
    });
    expect(result.current.photos).toHaveLength(1);
  });

  it("removes and clears", async () => {
    const { result } = renderHook(() => usePhotoAttachments(5));
    await act(async () => {
      await result.current.add([file("a.png"), file("b.png")]);
    });
    act(() => result.current.remove(result.current.photos[0].id));
    expect(result.current.photos.map((p) => p.base64)).toEqual([btoa("b.png")]);
    act(() => result.current.clear());
    expect(result.current.photos).toEqual([]);
  });

  it("ignores a null file list", async () => {
    const { result } = renderHook(() => usePhotoAttachments(5));
    expect(await result.current.add(null)).toBeNull();
  });
});
