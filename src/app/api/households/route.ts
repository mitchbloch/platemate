import { NextRequest, NextResponse } from "next/server";
import { getHousehold } from "@/lib/household";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/supabase/auth";

/** POST /api/households — Create a new household and add the current user as admin */
export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "Household name is required" }, { status: 400 });
    }

    const displayName: string | null =
      body.displayName?.trim() ||
      user.user_metadata?.full_name ||
      user.email ||
      null;

    // Atomic: create household + member + profile in one transaction via SECURITY DEFINER RPC
    const supabase = await createClient();
    const { data: householdId, error: rpcError } = await supabase.rpc(
      "create_household_with_member",
      {
        household_name: body.name.trim(),
        p_display_name: displayName,
      },
    );

    if (rpcError) {
      console.error("[POST /api/households] RPC error:", rpcError);
      throw rpcError;
    }

    // Fetch the full household for the response
    const household = await getHousehold(householdId as string);
    return NextResponse.json({ household }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/households] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to create household";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
