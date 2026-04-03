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

    // Add user as member — only swallow duplicate-key errors (already a member)
    try {
      await addHouseholdMember(household.id, user.id, "member");
    } catch (err) {
      const pgErr = err as { code?: string };
      if (pgErr?.code !== "23505") throw err;
    }

    // Create or update user profile with this household as active
    const existingProfile = await getUserProfile(user.id);
    if (existingProfile) {
      const updates: { activeHouseholdId: string; displayName?: string } = { activeHouseholdId: household.id };
      if (body.displayName) updates.displayName = body.displayName;
      await updateUserProfile(user.id, updates);
    } else {
      await createUserProfile(user.id, {
        displayName: body.displayName ?? user.user_metadata?.full_name ?? user.email ?? undefined,
        activeHouseholdId: household.id,
      });
    }

    return NextResponse.json({ household }, { status: 200 });
  } catch (error) {
    console.error("[POST /api/households/join] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to join household";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
