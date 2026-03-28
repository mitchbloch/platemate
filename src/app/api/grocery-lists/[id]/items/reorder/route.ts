import { NextRequest, NextResponse } from "next/server";
import { bulkUpdateSortOrder } from "@/lib/groceryList";

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!Array.isArray(body.items) || body.items.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: items" },
        { status: 400 },
      );
    }

    await bulkUpdateSortOrder(
      body.items.map((i: { id: string; sortOrder: number }) => ({
        id: i.id,
        sortOrder: i.sortOrder,
      })),
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reorder items";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
