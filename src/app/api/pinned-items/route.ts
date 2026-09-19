import { NextRequest, NextResponse } from "next/server";
import {
  getPinnedItems,
  addPinnedItem,
  updatePinnedItem,
  removePinnedItem,
  getFrequentItems,
} from "@/lib/pinnedItems";
import { validatePinnedItemUpdate } from "@/lib/weeklyStaples";
import { toGroceryDisplayCategory } from "@/lib/categoryMap";

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
      category: (typeof body.category === "string" && toGroceryDisplayCategory(body.category)) || "Other",
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

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const id = body && typeof body === "object" ? (body as { id?: unknown }).id : undefined;
    if (typeof id !== "string" || !id) {
      return NextResponse.json({ error: "Missing required field: id" }, { status: 400 });
    }

    const rest: Record<string, unknown> = { ...(body as Record<string, unknown>) };
    delete rest.id;
    const result = validatePinnedItemUpdate(rest);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const item = await updatePinnedItem(id, result.updates);
    return NextResponse.json(item);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update pinned item";
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
