import Nav from "@/components/Nav";
import GroceryListView from "@/components/GroceryListView";
import { getWeekStart, getMealPlanWithRecipes } from "@/lib/mealPlans";
import { getOrCreateGroceryListByWeek, getSmartWeekStart } from "@/lib/groceryList";
import { getPinnedItems, getFrequentItems } from "@/lib/pinnedItems";
import { getPantryItems } from "@/lib/pantryItems";

export const dynamic = "force-dynamic";

export default async function GroceryPage() {
  const weekStart = await getSmartWeekStart(getWeekStart());

  const [groceryData, { meals }, pinnedItems, frequentItems, pantryItems] = await Promise.all([
    getOrCreateGroceryListByWeek(weekStart),
    getMealPlanWithRecipes(weekStart),
    getPinnedItems(),
    getFrequentItems(),
    getPantryItems(),
  ]);

  const hasRecipeItems = groceryData.items.some((i) => i.recipeIds.length > 0);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <GroceryListView
          initialList={groceryData.list}
          initialItems={groceryData.items}
          initialWeekStart={weekStart}
          hasMeals={meals.length > 0}
          hasRecipeItems={hasRecipeItems}
          initialPantryItems={pantryItems}
          initialPinnedItems={pinnedItems}
          initialFrequentItems={frequentItems}
        />
      </main>
    </>
  );
}
