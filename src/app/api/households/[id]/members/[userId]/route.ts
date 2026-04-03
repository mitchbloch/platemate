import { NextResponse } from "next/server";
import { removeMember } from "@/lib/household";
import { getUser } from "@/lib/supabase/auth";

/** DELETE /api/households/[id]/members/[userId] — Remove a member */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const { id, userId } = await params;
    await removeMember(id, userId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove member";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
