import { NextRequest, NextResponse } from "next/server";
import { createHousehold, addHouseholdMember } from "@/lib/household";
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

    // Create household
    const household = await createHousehold(body.name.trim());

    // Add user as admin
    await addHouseholdMember(household.id, user.id, "admin");

    // Create or update user profile with this household as active
    const { getUserProfile } = await import("@/lib/userProfile");
    const existingProfile = await getUserProfile(user.id);

    if (existingProfile) {
      await updateUserProfile(user.id, { activeHouseholdId: household.id });
    } else {
      await createUserProfile(user.id, {
        displayName: user.user_metadata?.full_name ?? user.email ?? undefined,
        activeHouseholdId: household.id,
      });
    }

    return NextResponse.json({ household }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create household";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
