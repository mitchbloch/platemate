import Nav from "@/components/Nav";
import GroceryListView from "@/components/GroceryListView";
import PinnedItemsManager from "@/components/PinnedItemsManager";
import { getWeekStart, getMealPlanWithRecipes } from "@/lib/mealPlans";
import { getGroceryListByMealPlan } from "@/lib/groceryList";
import { getPinnedItems, getFrequentItems } from "@/lib/pinnedItems";

export const dynamic = "force-dynamic";

export default async function GroceryPage() {
  const weekStart = getWeekStart();

  const [{ plan, meals }, pinnedItems, frequentItems] = await Promise.all([
    getMealPlanWithRecipes(weekStart),
    getPinnedItems(),
    getFrequentItems(),
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
        />
        <div className="mt-8">
          <PinnedItemsManager
            initialPinned={pinnedItems}
            initialFrequent={frequentItems}
          />
        </div>
      </main>
    </>
  );
}
