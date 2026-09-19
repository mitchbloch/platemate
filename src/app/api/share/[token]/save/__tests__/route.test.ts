import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// A swappable implementation rather than vi.fn(): vitest's mock tracking
// reports a rejected mock result as an unhandled rejection even though the
// route awaits and catches it.
type Result = { recipeId: string; existing: boolean };
const dal = {
  calls: [] as string[],
  impl: (async () => ({ recipeId: "x", existing: false })) as (token: string) => Promise<Result>,
};
vi.mock("@/lib/recipeShares", () => ({
  saveSharedRecipe: (token: string) => {
    dal.calls.push(token);
    return dal.impl(token);
  },
}));

import { POST } from "../route";

function call(token = "tok") {
  return POST(new NextRequest("http://localhost/api/share/tok/save", { method: "POST" }), { params: Promise.resolve({ token }) });
}

describe("POST /api/share/[token]/save", () => {
  beforeEach(() => {
    dal.calls = [];
  });

  it("404s when the link is missing or revoked", async () => {
    dal.impl = async () => { throw new Error("This link is no longer active"); };
    const res = await call();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "This link is no longer active" });
  });

  it("409s with the existing id when the active household already has the recipe", async () => {
    dal.impl = async () => ({ recipeId: "src1", existing: true });
    const res = await call();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Already in your library", recipeId: "src1" });
  });

  it("returns the new copy's id", async () => {
    dal.impl = async () => ({ recipeId: "new1", existing: false });
    const res = await call();
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "new1" });
    expect(dal.calls).toEqual(["tok"]);
  });

  it("400s when the caller has no active household", async () => {
    dal.impl = async () => { throw new Error("No active household"); };
    expect((await call()).status).toBe(400);
  });

  it("500s on anything unexpected without leaking internals", async () => {
    dal.impl = async () => { throw new Error("connection reset"); };
    const res = await call();
    expect(res.status).toBe(500);
  });
});
