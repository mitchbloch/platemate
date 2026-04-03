import { NextRequest, NextResponse } from "next/server";
import { getHouseholdByInviteCode, addHouseholdMember } from "@/lib/household";
import { getUserProfile, createUserProfile, updateUserProfile } from "@/lib/userProfile";
import { getUser } from "@/lib/supabase/auth";

/** POST /api/households/join — Join a household by invite code */
export async function POST(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    if (!body.inviteCode?.trim()) {
      return NextResponse.json({ error: "Invite code is required" }, { status: 400 });
    }

    // Look up household by invite code
    const household = await getHouseholdByInviteCode(body.inviteCode.trim());
    if (!household) {
      return NextResponse.json(
        { error: "Invalid or expired invite code" },
        { status: 404 },
      );
    }

    // Add user as member (will error on duplicate, which is fine)
    try {
      await addHouseholdMember(household.id, user.id, "member");
    } catch {
      // Already a member — that's ok
    }

    // Create or update user profile with this household as active
    const existingProfile = await getUserProfile(user.id);
    if (existingProfile) {
      await updateUserProfile(user.id, { activeHouseholdId: household.id });
    } else {
      await createUserProfile(user.id, {
        displayName: user.user_metadata?.full_name ?? user.email ?? undefined,
        activeHouseholdId: household.id,
      });
    }

    return NextResponse.json({ household }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to join household";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
