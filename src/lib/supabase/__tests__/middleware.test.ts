import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// ── Supabase client double ──
// Middleware now verifies the session via getClaims() (local JWT check)
// instead of getUser() (auth-server round trip). These tests pin the
// routing decisions that depend on that result.
const state = {
  claims: null as null | { sub: string },
  profile: null as null | { active_household_id: string | null },
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () =>
        state.claims ? { data: { claims: state.claims }, error: null } : { data: null, error: null },
      getUser: () => {
        throw new Error("middleware must not call getUser() — that is the network round trip we removed");
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: state.profile, error: null }),
        }),
      }),
    }),
  }),
}));

import { updateSession } from "../middleware";

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(`http://localhost:3000${path}`);
  for (const [k, v] of Object.entries(cookies)) req.cookies.set(k, v);
  return req;
}

describe("updateSession (middleware)", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://x.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    state.claims = null;
    state.profile = null;
  });

  it("returns 401 JSON for unauthenticated API requests", async () => {
    const res = await updateSession(request("/api/recipes"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Not authenticated" });
  });

  it("redirects unauthenticated page requests to /login, remembering where they were going", async () => {
    const res = await updateSession(request("/plan?add=1"));
    expect(res.status).toBe(307);
    const url = new URL(res.headers.get("location")!);
    expect(url.pathname).toBe("/login");
    expect(url.searchParams.get("next")).toBe("/plan?add=1");
    // The home page needs no `next`
    const home = await updateSession(request("/"));
    expect(new URL(home.headers.get("location")!).searchParams.get("next")).toBeNull();
  });

  it("leaves public routes alone when signed out", async () => {
    for (const path of ["/login", "/signup", "/auth/callback", "/r/abc123"]) {
      const res = await updateSession(request(path));
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("sends a signed-in user away from /login", async () => {
    state.claims = { sub: "u1" };
    const res = await updateSession(request("/login"));
    expect(new URL(res.headers.get("location")!).pathname).toBe("/");
  });

  it("redirects a signed-in user with no household to household setup", async () => {
    state.claims = { sub: "u1" };
    state.profile = { active_household_id: null };
    const res = await updateSession(request("/plan"));
    const url = new URL(res.headers.get("location")!);
    expect(url.pathname).toBe("/signup");
    expect(url.searchParams.get("step")).toBe("household");
    expect(url.searchParams.get("next")).toBe("/plan");
  });

  it("passes through and sets the has-household cookie on first visit", async () => {
    state.claims = { sub: "u1" };
    state.profile = { active_household_id: "h1" };
    const res = await updateSession(request("/plan"));
    expect(res.headers.get("location")).toBeNull();
    const cookie = res.cookies.get("platemate-has-household");
    expect(cookie?.value).toBe("1");
    expect(cookie?.httpOnly).toBe(true);
  });

  it("skips the profile query when the has-household cookie is present", async () => {
    state.claims = { sub: "u1" };
    state.profile = null; // would redirect if consulted
    const res = await updateSession(request("/plan", { "platemate-has-household": "1" }));
    expect(res.headers.get("location")).toBeNull();
  });

  it("does not run the household check for API routes", async () => {
    state.claims = { sub: "u1" };
    state.profile = null;
    const res = await updateSession(request("/api/recipes"));
    expect(res.status).toBe(200);
  });
});
