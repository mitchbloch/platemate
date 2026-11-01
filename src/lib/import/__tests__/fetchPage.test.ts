import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dns = vi.hoisted(() => ({ answers: {} as Record<string, string[]> }));
vi.mock("node:dns/promises", () => ({
  lookup: async (host: string) => {
    const ips = dns.answers[host] ?? ["93.184.216.34"];
    if (ips.length === 0) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return ips.map((address) => ({ address, family: address.includes(":") ? 6 : 4 }));
  },
}));

import {
  assertPublicHttpUrl,
  createDeadline,
  fetchPage,
  ImportFailure,
  isPrivateAddress,
  subDeadline,
} from "../fetchPage";

type Route = (init: RequestInit) => Response | Promise<Response>;
let routes: Record<string, Route>;
let calls: { url: string; init: RequestInit }[];

beforeEach(() => {
  routes = {};
  calls = [];
  dns.answers = {};
  vi.stubGlobal("fetch", async (input: URL | string, init: RequestInit) => {
    const url = input.toString();
    calls.push({ url, init });
    const route = routes[url];
    if (!route) throw new TypeError(`fetch failed: no route for ${url}`);
    return route(init);
  });
});
afterEach(() => vi.unstubAllGlobals());

const html = (body: string, init: ResponseInit = {}) =>
  new Response(body, { status: 200, headers: { "content-type": "text/html; charset=utf-8" }, ...init });
const redirect = (location: string, status = 301) => new Response(null, { status, headers: { location } });

async function failure(promise: Promise<unknown>): Promise<ImportFailure> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ImportFailure);
    return err as ImportFailure;
  }
  throw new Error("expected an ImportFailure");
}

const opts = () => ({ deadline: createDeadline(5_000) });

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

  it("rejects URLs carrying credentials", () => {
    expect(() => assertPublicHttpUrl("https://user:pass@example.com/")).toThrow("credentials");
  });

  it("rejects localhost and internal hostnames", () => {
    expect(() => assertPublicHttpUrl("http://localhost:3000/admin")).toThrow();
    expect(() => assertPublicHttpUrl("http://app.localhost/")).toThrow();
    expect(() => assertPublicHttpUrl("http://intranet/secrets")).toThrow();
    expect(() => assertPublicHttpUrl("http://db.internal/")).toThrow();
    expect(() => assertPublicHttpUrl("http://printer.local/")).toThrow();
  });

  it("rejects private and reserved IPv4 ranges, including shorthand forms", () => {
    for (const host of [
      "127.0.0.1",
      "10.0.0.5",
      "192.168.1.1",
      "172.16.0.1",
      "172.31.255.255",
      "169.254.169.254", // cloud metadata endpoint
      "100.64.0.1",
      "0.0.0.0",
      "0.1.2.3",
      "2130706433", // 127.0.0.1 as an integer
      "0x7f.1", // 127.0.0.1 in hex shorthand
    ]) {
      expect(() => assertPublicHttpUrl(`http://${host}/`), host).toThrow();
    }
  });

  it("allows public IPv4 addresses", () => {
    expect(() => assertPublicHttpUrl("http://93.184.216.34/")).not.toThrow();
    expect(() => assertPublicHttpUrl("http://172.32.0.1/")).not.toThrow(); // just outside 172.16/12
  });

  it("rejects IPv6 loopback, private, and IPv4-mapped private addresses", () => {
    for (const host of ["::1", "::", "fc00::1", "fd12::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:a9fe:a9fe"]) {
      expect(() => assertPublicHttpUrl(`http://[${host}]/`), host).toThrow();
    }
  });

  it("allows public IPv6 and IPv4-mapped public addresses", () => {
    expect(() => assertPublicHttpUrl("http://[2606:4700::6810:84e5]/")).not.toThrow();
    expect(() => assertPublicHttpUrl("http://[::ffff:5db8:d822]/")).not.toThrow(); // 93.184.216.34
  });
});

describe("isPrivateAddress", () => {
  it("ignores non-IP strings", () => {
    expect(isPrivateAddress("example.com")).toBe(false);
  });
});

describe("fetchPage", () => {
  it("returns the decoded page and final URL", async () => {
    routes["https://site.com/r"] = () => html("<h1>Soup</h1>");
    const page = await fetchPage("https://site.com/r", opts());
    expect(page).toMatchObject({ url: "https://site.com/r", status: 200, text: "<h1>Soup</h1>" });
  });

  it("sends a browser identity and never retries under another", async () => {
    routes["https://site.com/r"] = () => html("x", { status: 403 });
    await failure(fetchPage("https://site.com/r", opts()));
    expect(calls).toHaveLength(1);
    expect((calls[0].init.headers as Record<string, string>)["User-Agent"]).toMatch(/Chrome/);
  });

  describe("redirects", () => {
    it("follows relative Location headers manually", async () => {
      routes["https://www.tiktok.com/t/abc/"] = () => redirect("/@u/video/1?_r=1");
      routes["https://www.tiktok.com/@u/video/1?_r=1"] = () => html("ok");
      const page = await fetchPage("https://www.tiktok.com/t/abc/", opts());
      expect(page.url).toBe("https://www.tiktok.com/@u/video/1?_r=1");
      expect(calls.every((c) => c.init.redirect === "manual")).toBe(true);
    });

    it("rejects a later hop to a private IP (regression: guard only checked hop 1)", async () => {
      routes["https://short.example/x"] = () => redirect("http://169.254.169.254/latest/meta-data/");
      const err = await failure(fetchPage("https://short.example/x", opts()));
      expect(err.reason).toBe("unsupported");
      expect(calls).toHaveLength(1); // never fetched the metadata endpoint
    });

    it("rejects a hostname that resolves to a private address", async () => {
      dns.answers["127.0.0.1.nip.io"] = ["127.0.0.1"];
      const err = await failure(fetchPage("http://127.0.0.1.nip.io/", opts()));
      expect(err.reason).toBe("unsupported");
      expect(calls).toHaveLength(0);
    });

    it("rejects when any resolved address is private", async () => {
      dns.answers["mixed.example"] = ["93.184.216.34", "10.0.0.1"];
      expect((await failure(fetchPage("https://mixed.example/", opts()))).reason).toBe("unsupported");
    });

    it("reports DNS failure as fetch_failed", async () => {
      dns.answers["gone.example"] = [];
      expect((await failure(fetchPage("https://gone.example/", opts()))).reason).toBe("fetch_failed");
    });

    it("detects redirect loops", async () => {
      routes["https://a.example/"] = () => redirect("https://b.example/");
      routes["https://b.example/"] = () => redirect("https://a.example/");
      const err = await failure(fetchPage("https://a.example/", opts()));
      expect(err.detail).toBe("redirect loop");
    });

    it("gives up after 5 redirects", async () => {
      for (let i = 0; i < 7; i++) routes[`https://r.example/${i}`] = () => redirect(`https://r.example/${i + 1}`);
      const err = await failure(fetchPage("https://r.example/0", opts()));
      expect(err.detail).toBe("too many redirects");
      expect(calls).toHaveLength(6);
    });

    it("rejects a redirect into a URL with credentials", async () => {
      routes["https://a.example/"] = () => redirect("https://u:p@b.example/");
      expect((await failure(fetchPage("https://a.example/", opts()))).reason).toBe("unsupported");
    });

    it("fails a redirect without a Location header", async () => {
      routes["https://a.example/"] = () => new Response(null, { status: 302 });
      expect((await failure(fetchPage("https://a.example/", opts()))).reason).toBe("fetch_failed");
    });
  });

  describe("status mapping", () => {
    it.each([
      [404, "not_found"],
      [410, "not_found"],
      [401, "login_required"],
      [402, "blocked"], // People Inc (AllRecipes, Serious Eats)
      [403, "blocked"],
      [429, "blocked"],
      [503, "blocked"],
      [500, "fetch_failed"],
    ])("HTTP %i → %s", async (status, reason) => {
      routes["https://site.com/"] = () => html("nope", { status });
      expect((await failure(fetchPage("https://site.com/", opts()))).reason).toBe(reason);
    });

    it("detects a Cloudflare challenge served with 200", async () => {
      routes["https://site.com/"] = () =>
        html("<html><head><title>Just a moment...</title></head><script>window._cf_chl_opt={}</script></html>");
      const err = await failure(fetchPage("https://site.com/", opts()));
      expect(err.reason).toBe("blocked");
      expect(err.message).toBe("This site doesn't allow automatic import.");
    });

    it("does not flag ordinary pages that load Cloudflare's challenge-platform script", async () => {
      routes["https://site.com/"] = () => html('<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script><h1>Soup</h1>');
      await expect(fetchPage("https://site.com/", opts())).resolves.toMatchObject({ status: 200 });
    });
  });

  describe("body handling", () => {
    it("rejects binary content without reading it", async () => {
      routes["https://site.com/menu.pdf"] = () => new Response("%PDF", { headers: { "content-type": "application/pdf" } });
      expect((await failure(fetchPage("https://site.com/menu.pdf", opts()))).reason).toBe("unsupported");
    });

    it("tolerates a missing content-type", async () => {
      routes["https://site.com/"] = () => new Response("<h1>ok</h1>", { status: 200 });
      expect((await fetchPage("https://site.com/", opts())).text).toBe("<h1>ok</h1>");
    });

    it("keeps only the first maxBytes of an oversized body", async () => {
      routes["https://site.com/"] = () => {
        const chunk = new TextEncoder().encode("a".repeat(1000));
        let sent = 0;
        const stream = new ReadableStream<Uint8Array>({
          pull(controller) {
            if (sent++ < 1_000) controller.enqueue(chunk); // would be 1MB
            else controller.close();
          },
        });
        return new Response(stream, { headers: { "content-type": "text/html" } });
      };
      const page = await fetchPage("https://site.com/", { ...opts(), maxBytes: 2_500 });
      expect(page.text).toHaveLength(2_500);
    });

    it("decodes the charset from the header", async () => {
      // "café" in windows-1252: é = 0xE9
      routes["https://site.com/"] = () =>
        new Response(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), { headers: { "content-type": "text/html; charset=windows-1252" } });
      expect((await fetchPage("https://site.com/", opts())).text).toBe("café");
    });

    it("sniffs the charset from <meta charset> when the header has none", async () => {
      const bytes = new Uint8Array([...new TextEncoder().encode('<meta charset="iso-8859-1">'), 0xe9]);
      routes["https://site.com/"] = () => new Response(bytes, { headers: { "content-type": "text/html" } });
      expect((await fetchPage("https://site.com/", opts())).text).toBe('<meta charset="iso-8859-1">é');
    });

    it("falls back to utf-8 for an unknown charset label", async () => {
      routes["https://site.com/"] = () => new Response("ok", { headers: { "content-type": "text/html; charset=bogus-9" } });
      expect((await fetchPage("https://site.com/", opts())).text).toBe("ok");
    });
  });

  describe("deadline", () => {
    it("reports an aborted fetch as a timeout", async () => {
      routes["https://slow.example/"] = (init) =>
        new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
      const err = await failure(fetchPage("https://slow.example/", { deadline: createDeadline(20) }));
      expect(err).toMatchObject({ reason: "fetch_failed", detail: "timed out" });
    });

    it("subDeadline never outlives its parent", () => {
      const parent = createDeadline(1_000);
      expect(subDeadline(parent, 60_000).remainingMs()).toBeLessThanOrEqual(1_000);
      expect(subDeadline(parent, 100).remainingMs()).toBeLessThanOrEqual(100);
    });

    it("subDeadline aborts when the parent aborts", async () => {
      const parent = createDeadline(10);
      const child = subDeadline(parent, 60_000);
      await new Promise((r) => setTimeout(r, 30));
      expect(child.signal.aborted).toBe(true);
    });
  });
});
