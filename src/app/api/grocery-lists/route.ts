import { NextRequest, NextResponse } from "next/server";
import { getMealPlanWithRecipes, getMealPlanByWeek } from "@/lib/mealPlans";
import {
  generateGroceryItems,
  getGroceryListByMealPlan,
  saveGroceryList,
} from "@/lib/groceryList";
import { getPinnedItems } from "@/lib/pinnedItems";
import { getPantryItems } from "@/lib/pantryItems";
import type { MergedIngredient } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const week = request.nextUrl.searchParams.get("week");
    if (!week) {
      return NextResponse.json(
        { error: "Missing required query parameter: week" },
        { status: 400 },
      );
    }

    const plan = await getMealPlanByWeek(week);
    if (!plan) {
      return NextResponse.json({ list: null, items: [] });
    }

    const result = await getGroceryListByMealPlan(plan.id);
    return NextResponse.json(result ?? { list: null, items: [] });
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
    if (!plan) {
      return NextResponse.json(
        { error: "No meal plan found for this week" },
        { status: 404 },
      );
    }

    if (meals.length === 0) {
      return NextResponse.json(
        { error: "Meal plan has no recipes. Add meals first." },
        { status: 400 },
      );
    }

    const mergedItems = generateGroceryItems(meals);

    // Add pinned items (staples like bananas, milk, yogurt)
    const pinnedItems = await getPinnedItems();
    for (const pinned of pinnedItems) {
      // Map pinned display category to a grocery display category
      const displayCat = pinned.category;
      // Check if already in list (by normalized name)
      const normalizedPinnedName = pinned.name.toLowerCase().trim();
      const alreadyInList = mergedItems.some(
        (i) => i.name === normalizedPinnedName,
      );
      if (!alreadyInList) {
        mergedItems.push({
          name: normalizedPinnedName,
          displayName: pinned.name,
          quantity: pinned.quantity,
          unit: pinned.unit,
          category: displayCat,
          store: pinned.store,
          recipeIds: [],
        } satisfies MergedIngredient);
      }
    }

    // Build pantry names set for auto-dismissal
    const pantryItems = await getPantryItems();
    const pantryNames = new Set(pantryItems.map((p) => p.name.toLowerCase().trim()));

    const result = await saveGroceryList(plan.id, mergedItems, pantryNames);

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate grocery list";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
