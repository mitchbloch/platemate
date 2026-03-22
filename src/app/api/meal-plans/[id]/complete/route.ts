import { NextRequest, NextResponse } from "next/server";
import { getMealPlanRecipeIds } from "@/lib/mealPlans";
import { logCookedRecipes } from "@/lib/recipeHistory";
import { createClient } from "@/lib/supabase/server";

/** Mark a meal plan as complete — log confirmed recipes to history. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: planId } = await params;
    const body = await request.json();
    const confirmedRecipeIds: string[] = body.recipeIds;

    if (!Array.isArray(confirmedRecipeIds) || confirmedRecipeIds.length === 0) {
      return NextResponse.json(
        { error: "Missing required field: recipeIds (non-empty array)" },
        { status: 400 },
      );
    }

    // Verify these recipes actually belong to this plan
    const planRecipeIds = await getMealPlanRecipeIds(planId);
    const validIds = confirmedRecipeIds.filter((id) => planRecipeIds.includes(id));

    if (validIds.length === 0) {
      return NextResponse.json(
        { error: "None of the provided recipe IDs belong to this plan" },
        { status: 400 },
      );
    }

    // Get the plan's week_start for the cooked_at date
    const supabase = await createClient();
    const { data: plan, error: planError } = await supabase
      .from("meal_plans")
      .select("week_start")
      .eq("id", planId)
      .single();

    if (planError || !plan) {
      return NextResponse.json({ error: "Meal plan not found" }, { status: 404 });
    }

    const logged = await logCookedRecipes(
      validIds.map((recipeId) => ({
        recipeId,
        cookedAt: plan.week_start,
      })),
    );

    return NextResponse.json({ logged });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to complete meal plan";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
