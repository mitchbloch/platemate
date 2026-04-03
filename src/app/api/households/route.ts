import { NextRequest, NextResponse } from "next/server";
import { createHousehold, addHouseholdMember, getHousehold } from "@/lib/household";
import { createUserProfile, updateUserProfile } from "@/lib/userProfile";
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

    // Create household (returns id only — user can't SELECT until they're a member)
    const householdId = await createHousehold(body.name.trim());

    // Add user as admin
    await addHouseholdMember(householdId, user.id, "admin");

    // Create or update user profile with this household as active
    const { getUserProfile } = await import("@/lib/userProfile");
    const existingProfile = await getUserProfile(user.id);

    if (existingProfile) {
      const updates: { activeHouseholdId: string; displayName?: string } = { activeHouseholdId: householdId };
      if (body.displayName) updates.displayName = body.displayName;
      await updateUserProfile(user.id, updates);
    } else {
      await createUserProfile(user.id, {
        displayName: body.displayName ?? user.user_metadata?.full_name ?? user.email ?? undefined,
        activeHouseholdId: householdId,
      });
    }

    // Now that user is a member, fetch the full household
    const household = await getHousehold(householdId);
    return NextResponse.json({ household }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create household";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
