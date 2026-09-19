import { Suspense } from "react";
import Nav from "@/components/Nav";
import WeeklyPlanner from "@/components/WeeklyPlanner";
import { listRecipes } from "@/lib/recipes";
import { getMealPlanWithRecipes, getWeekStart } from "@/lib/mealPlans";
import { getSmartWeekStart } from "@/lib/groceryList";
import { getLastCookedDates } from "@/lib/recipeHistory";

export const dynamic = "force-dynamic";

export default async function PlanPage() {
  const weekStart = await getSmartWeekStart(getWeekStart());

  const [recipes, { plan, meals }, lastCookedDates] = await Promise.all([
    listRecipes(),
    getMealPlanWithRecipes(weekStart),
    getLastCookedDates(),
  ]);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        {/* useSearchParams needs a Suspense boundary */}
        <Suspense>
          <WeeklyPlanner
            initialRecipes={recipes}
            initialPlan={plan}
            initialMeals={meals}
            initialWeekStart={weekStart}
            lastCookedDates={lastCookedDates}
          />
        </Suspense>
      </main>
    </>
  );
}
