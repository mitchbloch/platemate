import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

import { extractImportSource } from "..";
import { createDeadline } from "../fetchPage";
import { ImportFailure } from "../failure";
import { pickSubtitle } from "../tiktok";
import {
  TIKTOK_VTT_URL,
  hangingResponse,
  htmlResponse,
  redirectResponse,
  stubFetch,
  textResponse,
  tiktokPage,
  tiktokVtt,
} from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

const SHORT = "https://www.tiktok.com/t/ZPLPoL8uG/";
const CANONICAL = "https://www.tiktok.com/@panaceapalm/video/7641621946563661078?_r=1&_t=ZP-9B2syTDdo1X";

async function failure(promise: Promise<unknown>): Promise<ImportFailure> {
  const err = await promise.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ImportFailure);
  return err as ImportFailure;
}

describe("extractImportSource — TikTok", () => {
  it("follows the short link and returns caption, transcript, author and clean URL (regression: oEmbed lost the caption)", async () => {
    const calls = stubFetch({
      [SHORT]: () => redirectResponse(CANONICAL),
      [CANONICAL]: () => htmlResponse(tiktokPage()),
      [TIKTOK_VTT_URL]: () => textResponse(tiktokVtt, "text/vtt"),
    });
    const source = await extractImportSource(SHORT, createDeadline(5_000));
    expect(source.sections).toEqual([
      {
        label: "CAPTION",
        text: "High Protein Sheetpan Chicken Kebabs! 🔥 Chicken Kebabs - 1kg lean ground chicken - 2 tsp paprika };{ Oven Bake: 190°C | 20-25 minutes",
      },
      { label: "TRANSCRIPT", text: "Get your onions, bell pepper and garlic\nand blitz them in a food processor" },
    ]);
    expect(source).toMatchObject({
      sourceName: "TikTok — Panacea Palm",
      imageUrl: null, // signed cover URL is never stored
      sourceUrl: "https://www.tiktok.com/@panaceapalm/video/7641621946563661078",
      images: [],
    });
    expect(calls).toEqual([SHORT, CANONICAL, TIKTOK_VTT_URL]); // no oEmbed call
  });

  it.each(["https://vt.tiktok.com/ZSabc/", "https://vm.tiktok.com/ZMabc/"])("handles %s short links", async (short) => {
    stubFetch({
      [short]: () => redirectResponse(CANONICAL),
      [CANONICAL]: () => htmlResponse(tiktokPage()),
      [TIKTOK_VTT_URL]: () => textResponse(tiktokVtt, "text/vtt"),
    });
    expect((await extractImportSource(short, createDeadline(5_000))).sourceName).toBe("TikTok — Panacea Palm");
  });

  it("reads a transcript the CDN mislabels as video/mp4 (regression, seen live 2026-11-01)", async () => {
    stubFetch({
      [CANONICAL]: () => htmlResponse(tiktokPage()),
      [TIKTOK_VTT_URL]: () => textResponse(tiktokVtt, "video/mp4"),
    });
    const source = await extractImportSource(CANONICAL, createDeadline(5_000));
    expect(source.sections.map((s) => s.label)).toEqual(["CAPTION", "TRANSCRIPT"]);
  });

  it("ignores a 'transcript' response that isn't WebVTT", async () => {
    stubFetch({
      [CANONICAL]: () => htmlResponse(tiktokPage()),
      [TIKTOK_VTT_URL]: () => textResponse("\u0000\u0000\u0000 ftypisom binary", "video/mp4"),
    });
    const source = await extractImportSource(CANONICAL, createDeadline(5_000));
    expect(source.sections.map((s) => s.label)).toEqual(["CAPTION"]);
  });

  it("returns the caption alone when the transcript fetch fails", async () => {
    stubFetch({ [CANONICAL]: () => htmlResponse(tiktokPage()), [TIKTOK_VTT_URL]: () => htmlResponse("gone", 403) });
    const source = await extractImportSource(CANONICAL, createDeadline(5_000));
    expect(source.sections.map((s) => s.label)).toEqual(["CAPTION"]);
  });

  it("gives up on a slow transcript within its own budget and keeps the caption", async () => {
    stubFetch({ [CANONICAL]: () => htmlResponse(tiktokPage()), [TIKTOK_VTT_URL]: hangingResponse });
    const started = Date.now();
    const source = await extractImportSource(CANONICAL, createDeadline(10_000));
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(source.sections.map((s) => s.label)).toEqual(["CAPTION"]);
  }, 8_000);

  it("uses the transcript alone when the caption is empty (spoken-only recipe)", async () => {
    stubFetch({ [CANONICAL]: () => htmlResponse(tiktokPage({ desc: "  " })), [TIKTOK_VTT_URL]: () => textResponse(tiktokVtt) });
    const source = await extractImportSource(CANONICAL, createDeadline(5_000));
    expect(source.sections.map((s) => s.label)).toEqual(["TRANSCRIPT"]);
  });

  it("skips the transcript for photo posts", async () => {
    const calls = stubFetch({ [CANONICAL]: () => htmlResponse(tiktokPage({ imagePost: true })) });
    const source = await extractImportSource(CANONICAL, createDeadline(5_000));
    expect(source.sections.map((s) => s.label)).toEqual(["CAPTION"]);
    expect(calls).toEqual([CANONICAL]);
  });

  it("reports no_recipe when there is neither caption nor transcript", async () => {
    stubFetch({ [CANONICAL]: () => htmlResponse(tiktokPage({ desc: "", subtitles: [] })) });
    expect((await failure(extractImportSource(CANONICAL, createDeadline(5_000)))).reason).toBe("no_recipe");
  });

  it("reports a page without the post data as blocked", async () => {
    stubFetch({ [CANONICAL]: () => htmlResponse(tiktokPage({ omitScope: true })) });
    expect((await failure(extractImportSource(CANONICAL, createDeadline(5_000)))).reason).toBe("blocked");
  });

  it("maps a deleted post to not_found and a private one to login_required", async () => {
    stubFetch({ [CANONICAL]: () => htmlResponse(tiktokPage({ statusCode: 10204, statusMsg: "item doesn't exist" })) });
    expect((await failure(extractImportSource(CANONICAL, createDeadline(5_000)))).reason).toBe("not_found");

    stubFetch({ [CANONICAL]: () => htmlResponse(tiktokPage({ privateItem: true })) });
    expect((await failure(extractImportSource(CANONICAL, createDeadline(5_000)))).reason).toBe("login_required");

    stubFetch({ [CANONICAL]: () => htmlResponse(tiktokPage({ statusCode: 10216, statusMsg: "private item" })) });
    expect((await failure(extractImportSource(CANONICAL, createDeadline(5_000)))).reason).toBe("login_required");
  });

  it("never fetches a transcript URL that points at a private address", async () => {
    const internal = "http://169.254.169.254/latest/meta-data/";
    const calls = stubFetch({
      [CANONICAL]: () => htmlResponse(tiktokPage({ subtitles: [{ Url: internal, Source: "ASR", LanguageCodeName: "eng-US" }] })),
    });
    const source = await extractImportSource(CANONICAL, createDeadline(5_000));
    expect(calls).toEqual([CANONICAL]);
    expect(source.sections.map((s) => s.label)).toEqual(["CAPTION"]);
  });
});

describe("pickSubtitle", () => {
  const asr = { Url: "a", Source: "ASR", LanguageCodeName: "eng-US", Format: "webvtt" };
  const mt = { Url: "b", Source: "MT", LanguageCodeName: "eng-US", Format: "webvtt" };
  const asrSpanish = { Url: "c", Source: "ASR", LanguageCodeName: "spa-ES", Format: "webvtt" };

  it("prefers speech recognition in the post's language over translations", () => {
    expect(pickSubtitle([mt, asrSpanish, asr], "en")).toBe(asr);
    expect(pickSubtitle([mt, asrSpanish], "en")).toBe(asrSpanish);
    expect(pickSubtitle([mt], "en")).toBe(mt);
  });

  it("ignores entries without a URL or in another format", () => {
    expect(pickSubtitle([{ ...asr, Url: undefined as unknown as string }, { ...mt, Format: "srt" }], "en")).toBeNull();
    expect(pickSubtitle([], "en")).toBeNull();
  });
});
