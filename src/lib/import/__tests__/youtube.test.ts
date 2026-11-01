import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: async () => [{ address: "93.184.216.34", family: 4 }] }));

import { extractImportSource } from "..";
import { createDeadline } from "../fetchPage";
import { ImportFailure } from "../failure";
import { youTubeVideoId } from "../youtube";
import {
  YT_DESCRIPTION,
  YT_ID,
  YT_OEMBED,
  YT_WATCH,
  htmlResponse,
  jsonResponse,
  redirectResponse,
  stubFetch,
  youTubePage,
} from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

async function failure(promise: Promise<unknown>): Promise<ImportFailure> {
  const err = await promise.then(() => null, (e: unknown) => e);
  expect(err).toBeInstanceOf(ImportFailure);
  return err as ImportFailure;
}

describe("youTubeVideoId", () => {
  it.each([
    [`https://www.youtube.com/watch?v=${YT_ID}&si=abc`, YT_ID],
    [`https://youtu.be/${YT_ID}?si=abc`, YT_ID],
    [`https://www.youtube.com/shorts/${YT_ID}`, YT_ID],
    [`https://m.youtube.com/watch?v=${YT_ID}`, YT_ID],
    [`https://music.youtube.com/watch?v=${YT_ID}`, YT_ID],
    [`https://www.youtube.com/live/${YT_ID}?feature=share`, YT_ID],
    [`https://www.youtube.com/embed/${YT_ID}`, YT_ID],
    [`https://www.youtube-nocookie.com/embed/${YT_ID}`, YT_ID],
  ])("%s", (url, id) => {
    expect(youTubeVideoId(url)).toBe(id);
  });

  it("returns null for non-video pages and bad ids", () => {
    expect(youTubeVideoId("https://www.youtube.com/@TheMediterraneanDish")).toBeNull();
    expect(youTubeVideoId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(youTubeVideoId("https://youtu.be/")).toBeNull();
    expect(youTubeVideoId("not a url")).toBeNull();
  });
});

describe("extractImportSource — YouTube", () => {
  it("sends the full description, not the 160-char og:description (regression)", async () => {
    const calls = stubFetch({ [YT_WATCH]: () => htmlResponse(youTubePage()) });
    const source = await extractImportSource(`https://youtube.com/shorts/${YT_ID}?si=share`, createDeadline(5_000));
    expect(source.sections).toEqual([
      { label: "CAPTION", text: `20-Minute Dinner Recipe (Easy Chicken Recipe!) #shorts\n\n${YT_DESCRIPTION}` },
    ]);
    expect(source).toMatchObject({
      sourceName: "YouTube — The Mediterranean Dish",
      imageUrl: `https://i.ytimg.com/vi/${YT_ID}/hqdefault.jpg`,
      sourceUrl: `https://youtube.com/shorts/${YT_ID}`,
    });
    expect(calls).toEqual([YT_WATCH]); // one page fetch; no caption-track request
  });

  it("falls back to oEmbed + og:description behind a bot check, without retrying", async () => {
    const calls = stubFetch({
      [YT_WATCH]: () => htmlResponse(youTubePage({ status: "LOGIN_REQUIRED", reason: "Sign in to confirm you're not a bot" })),
      [YT_OEMBED]: () => jsonResponse({ title: "20-Minute Dinner", author_name: "The Mediterranean Dish" }),
    });
    const source = await extractImportSource(YT_WATCH, createDeadline(5_000));
    expect(source.sections[0].text).toMatch(/^20-Minute Dinner\n\nThis easy skillet mushroom chicken/);
    expect(source.sourceName).toBe("YouTube — The Mediterranean Dish");
    expect(calls).toEqual([YT_WATCH, YT_OEMBED]);
  });

  it("does not read the consent wall as content", async () => {
    const consent = "https://consent.youtube.com/m?continue=x";
    stubFetch({
      [YT_WATCH]: () => redirectResponse(consent),
      [consent]: () => htmlResponse(`<meta property="og:description" content="Before you continue to YouTube">`),
      [YT_OEMBED]: () => jsonResponse({ title: "20-Minute Dinner", author_name: "The Mediterranean Dish" }),
    });
    const source = await extractImportSource(YT_WATCH, createDeadline(5_000));
    expect(source.sections[0].text).toBe("20-Minute Dinner");
  });

  it("reports blocked when the bot check leaves nothing to read", async () => {
    stubFetch({
      [YT_WATCH]: () => htmlResponse("<html></html>".replace("</html>", `<script>var ytInitialPlayerResponse = {"playabilityStatus":{"status":"LOGIN_REQUIRED"}};</script></html>`)),
      [YT_OEMBED]: () => htmlResponse("Unauthorized", 401),
    });
    expect((await failure(extractImportSource(YT_WATCH, createDeadline(5_000)))).reason).toBe("blocked");
  });

  it("maps an unavailable video to not_found", async () => {
    stubFetch({ [YT_WATCH]: () => htmlResponse(youTubePage({ status: "ERROR", reason: "Video unavailable" })) });
    expect((await failure(extractImportSource(YT_WATCH, createDeadline(5_000)))).reason).toBe("not_found");
  });

  it("rejects YouTube URLs that aren't a video", async () => {
    const calls = stubFetch({});
    expect((await failure(extractImportSource("https://www.youtube.com/@chef", createDeadline(5_000)))).reason).toBe("unsupported");
    expect(calls).toEqual([]);
  });
});
