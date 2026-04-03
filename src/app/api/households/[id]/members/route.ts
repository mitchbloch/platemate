import { NextResponse } from "next/server";
import { getHouseholdMembers } from "@/lib/household";
import { getUser } from "@/lib/supabase/auth";

/** GET /api/households/[id]/members — List household members */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    const members = await getHouseholdMembers(id);
    return NextResponse.json(members);
  } catch (error) {
    console.error("[GET /api/households/members] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch members";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
