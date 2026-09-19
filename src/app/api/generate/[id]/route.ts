import { NextRequest, NextResponse } from "next/server";
import { deleteGeneration, getGeneration } from "@/lib/recipeGenerations";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const generation = await getGeneration(id);
    if (!generation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    return NextResponse.json(generation);
  } catch (error) {
    console.error("[GET /api/generate/[id]]", error);
    return NextResponse.json({ error: "Couldn't load that conversation" }, { status: 500 });
  }
}

/** DELETE — discard a chat. Saved chats stay (they document a recipe). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const generation = await getGeneration(id);
    if (!generation) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    if (generation.status === "saved") return NextResponse.json({ error: "Saved chats can't be discarded" }, { status: 409 });
    await deleteGeneration(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/generate/[id]]", error);
    return NextResponse.json({ error: "Couldn't discard that conversation" }, { status: 500 });
  }
}
