import { NextRequest, NextResponse } from "next/server";
import { getMealPlanByWeek, createMealPlan, addRecipeToMealPlan } from "@/lib/mealPlans";

/** Add a recipe to a meal plan. Auto-creates the plan if it doesn't exist for the given week. */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.weekStart || !body.recipeId || !body.mealType) {
      return NextResponse.json(
        { error: "Missing required fields: weekStart, recipeId, mealType" },
        { status: 400 },
      );
    }

    // Get or create the meal plan for this week
    let plan = await getMealPlanByWeek(body.weekStart);
    if (!plan) {
      const planId = await createMealPlan(body.weekStart);
      plan = { id: planId, householdId: "", weekStart: body.weekStart, notes: null, createdAt: "", updatedAt: "" };
    }

    const id = await addRecipeToMealPlan(plan.id, body.recipeId, body.mealType);
    return NextResponse.json({ planId: plan.id, id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to add recipe to meal plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
