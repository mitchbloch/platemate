import { NextRequest, NextResponse } from "next/server";
import { updateHouseholdPreferences, getHousehold } from "@/lib/household";
import { getUser } from "@/lib/supabase/auth";

/** PATCH /api/households/[id]/preferences — Update household preferences */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    await updateHouseholdPreferences(id, body);

    const updated = await getHousehold(id);
    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update preferences";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
