import { NextResponse } from "next/server";
import { getLastCookedDates } from "@/lib/recipeHistory";

export async function GET() {
  try {
    const lastCookedDates = await getLastCookedDates();
    return NextResponse.json(lastCookedDates);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch recipe history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
