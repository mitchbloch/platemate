import { NextRequest, NextResponse } from "next/server";
import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/auth";

/** POST /api/households/join — Join a household by invite code */
export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    if (typeof body.inviteCode !== "string" || !body.inviteCode.trim()) {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    const displayName: string | null =
      (typeof body.displayName === "string" && body.displayName.trim()) ||
      user.user_metadata?.full_name ||
      user.email ||
      null;

    // Atomic join via SECURITY DEFINER RPC: validates the code + expiry,
    // adds membership, and updates the profile. A direct lookup can't work
    // here — RLS only lets existing members read the household row.
    const supabase = await createClient();
    const { data: householdId, error: rpcError } = await supabase.rpc(
      "join_household_by_code",
      {
        invite_code_input: body.inviteCode.trim(),
        p_display_name: displayName,
      },
    );

    if (rpcError) {
      if (rpcError.message?.includes("Invalid or expired invite code")) {
        return NextResponse.json(
          { error: "Invalid or expired invite code" },
          { status: 404 },
        );
      }
      console.error("[POST /api/households/join] RPC error:", rpcError);
      return NextResponse.json({ error: "Failed to join household" }, { status: 500 });
    }

    const household = await getHousehold(householdId as string);
    return NextResponse.json({ household }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/households/join] Error:", error);
    return NextResponse.json({ error: "Failed to join household" }, { status: 500 });
  }
}
