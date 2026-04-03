import { NextRequest, NextResponse } from "next/server";
import { getUserProfile, updateUserProfile } from "@/lib/userProfile";
import { getUser } from "@/lib/supabase/auth";

/** GET /api/user/profile — Get current user's profile */
export async function GET() {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const profile = await getUserProfile(user.id);
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error("[GET /api/user/profile] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** PATCH /api/user/profile — Update current user's profile */
export async function PATCH(request: NextRequest) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    await updateUserProfile(user.id, {
      displayName: body.displayName,
      activeHouseholdId: body.activeHouseholdId,
      onboardingCompleted: body.onboardingCompleted,
      onboardingSkipped: body.onboardingSkipped,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[PATCH /api/user/profile] Error:", error);
    const message = error instanceof Error ? error.message : "Failed to update profile";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
