import { NextRequest, NextResponse } from "next/server";
import {
  getPinnedItems,
  addPinnedItem,
  removePinnedItem,
  getFrequentItems,
} from "@/lib/pinnedItems";

export async function GET(request: NextRequest) {
  try {
    const includeFrequent = request.nextUrl.searchParams.get("includeFrequent") === "true";

    const pinned = await getPinnedItems();
    const frequent = includeFrequent ? await getFrequentItems() : [];

    return NextResponse.json({ pinned, frequent });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch pinned items";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 },
      );
    }

    const item = await addPinnedItem({
      name: body.name,
      category: body.category ?? "other",
      store: body.store ?? "trader-joes",
      quantity: body.quantity ?? null,
      unit: body.unit ?? null,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to add pinned item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json(
        { error: "Missing required field: id" },
        { status: 400 },
      );
    }

    await removePinnedItem(body.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to remove pinned item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
