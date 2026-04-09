import { NextRequest, NextResponse } from "next/server";
import {
  addGroceryListItem,
  fetchListItems,
  updateGroceryListItem,
  deleteGroceryListItem,
} from "@/lib/groceryList";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: groceryListId } = await params;
    const items = await fetchListItems(groceryListId);
    return NextResponse.json(items);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch items";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: groceryListId } = await params;
    const body = await request.json();

    if (!body.name) {
      return NextResponse.json(
        { error: "Missing required field: name" },
        { status: 400 },
      );
    }

    const item = await addGroceryListItem(groceryListId, {
      name: body.name,
      quantity: body.quantity ?? null,
      unit: body.unit ?? null,
      category: body.category ?? "other",
      store: body.store ?? "trader-joes",
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to add item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.itemId) {
      return NextResponse.json(
        { error: "Missing required field: itemId" },
        { status: 400 },
      );
    }

    await updateGroceryListItem(body.itemId, {
      name: body.name,
      quantity: body.quantity,
      unit: body.unit,
      category: body.category,
      store: body.store,
      checked: body.checked,
      dismissed: body.dismissed,
      sortOrder: body.sortOrder,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.itemId) {
      return NextResponse.json(
        { error: "Missing required field: itemId" },
        { status: 400 },
      );
    }

    await deleteGroceryListItem(body.itemId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
