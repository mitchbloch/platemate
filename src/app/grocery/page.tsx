import Nav from "@/components/Nav";
import GroceryListView from "@/components/GroceryListView";
import { getWeekStart, getMealPlanWithRecipes } from "@/lib/mealPlans";
import { getGroceryListByMealPlan } from "@/lib/groceryList";
import { getPinnedItems, getFrequentItems } from "@/lib/pinnedItems";
import { getPantryItems } from "@/lib/pantryItems";

export const dynamic = "force-dynamic";

export default async function GroceryPage() {
  const weekStart = getWeekStart();

  const [{ plan, meals }, pinnedItems, frequentItems, pantryItems] = await Promise.all([
    getMealPlanWithRecipes(weekStart),
    getPinnedItems(),
    getFrequentItems(),
    getPantryItems(),
  ]);

  let groceryData: { list: null; items: [] } | Awaited<ReturnType<typeof getGroceryListByMealPlan>> = {
    list: null,
    items: [],
  };

  if (plan) {
    const result = await getGroceryListByMealPlan(plan.id);
    if (result) groceryData = result;
  }

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <GroceryListView
          initialList={groceryData.list}
          initialItems={groceryData.items}
          initialWeekStart={weekStart}
          hasMeals={meals.length > 0}
          initialPantryItems={pantryItems}
          initialPinnedItems={pinnedItems}
          initialFrequentItems={frequentItems}
        />
      </main>
    </>
  );
}
