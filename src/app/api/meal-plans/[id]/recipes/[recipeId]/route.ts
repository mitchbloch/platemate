import { NextRequest, NextResponse } from "next/server";
import { removeRecipeFromMealPlan } from "@/lib/mealPlans";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; recipeId: string }> },
) {
  try {
    const { recipeId } = await params;
    // recipeId here is the meal_plan_recipes row ID (not the recipe UUID)
    await removeRecipeFromMealPlan(recipeId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to remove recipe from plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
