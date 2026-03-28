import { NextRequest, NextResponse } from "next/server";
import { deleteGroceryList, updateGroceryList } from "@/lib/groceryList";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    await updateGroceryList(id, {
      status: body.status,
      completedAt: body.completedAt,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update grocery list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await deleteGroceryList(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete grocery list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
