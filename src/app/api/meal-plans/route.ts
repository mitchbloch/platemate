import { NextRequest, NextResponse } from "next/server";
import { getMealPlanWithRecipes, createMealPlan } from "@/lib/mealPlans";

export async function GET(request: NextRequest) {
  try {
    const week = request.nextUrl.searchParams.get("week");
    if (!week) {
      return NextResponse.json(
        { error: "Missing required query parameter: week" },
        { status: 400 },
      );
    }

    const result = await getMealPlanWithRecipes(week);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch meal plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.weekStart) {
      return NextResponse.json(
        { error: "Missing required field: weekStart" },
        { status: 400 },
      );
    }

    const id = await createMealPlan(body.weekStart, body.notes);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create meal plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
