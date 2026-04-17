import { NextRequest, NextResponse } from "next/server";
import { getMealPlanWithRecipes } from "@/lib/mealPlans";
import {
  generateGroceryItems,
  getOrCreateGroceryListByWeek,
  mergeRecipeItemsIntoList,
} from "@/lib/groceryList";
import { normalizeForMatching } from "@/lib/ingredientMerge";
import { getPantryItems } from "@/lib/pantryItems";

export async function GET(request: NextRequest) {
  try {
    const week = request.nextUrl.searchParams.get("week");
    if (!week) {
      return NextResponse.json(
        { error: "Missing required query parameter: week" },
        { status: 400 },
      );
    }

    const result = await getOrCreateGroceryListByWeek(week);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch grocery list";
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

    const { plan, meals } = await getMealPlanWithRecipes(body.weekStart);
    if (!plan || meals.length === 0) {
      return NextResponse.json(
        { error: "No meals to generate from. Add meals first." },
        { status: 400 },
      );
    }

    // Get or create the list for this week
    const { list } = await getOrCreateGroceryListByWeek(body.weekStart);

    // Generate recipe items from meals
    const recipeItems = generateGroceryItems(meals);

    // Build pantry matching keys for auto-dismissal (fuzzy matching)
    const pantryItems = await getPantryItems();
    const pantryNames = new Set(
      pantryItems.map((p) => normalizeForMatching(p.name)),
    );

    // Merge recipe items into existing list (preserves manual items)
    const result = await mergeRecipeItemsIntoList(
      list.id,
      plan.id,
      recipeItems,
      pantryNames,
    );

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate grocery list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
