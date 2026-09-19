import type { SharedRecipe } from "@/lib/types";
import { CUISINE_LABELS, DIETARY_FLAG_LABELS, MEAL_TYPE_LABELS } from "@/lib/types";
import NutritionBadge from "./NutritionBadge";

type RecipeLike = SharedRecipe["recipe"];

/** The read-only body of a recipe: meta chips, nutrition, ingredients,
 *  instructions, source link. Shared by the detail page and the public
 *  share page so the two can't drift. */
export default function RecipeContent({ recipe: r }: { recipe: RecipeLike }) {
  const totalTime = r.totalTimeMinutes ?? 0;
  return (
    <>
      <div className="mb-6">
        <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight text-text">{r.title}</h1>
        {r.description && <p className="mb-3 text-text-secondary">{r.description}</p>}
        <div className="flex flex-wrap gap-2 text-sm text-text-muted">
          {r.sourceName && <span>{r.sourceName}</span>}
          <span className="rounded-md bg-accent-light px-2 py-0.5 text-accent">{CUISINE_LABELS[r.cuisine]}</span>
          <span className="rounded-md bg-border-light px-2 py-0.5 text-text-secondary">{MEAL_TYPE_LABELS[r.mealType]}</span>
          {r.isSlowCooker && <span className="rounded-md bg-gold-light px-2 py-0.5 text-gold">Slow Cooker</span>}
          {totalTime > 0 && <span>{totalTime} min</span>}
          <span>{r.servings} servings</span>
          {r.dietaryFlags.map((flag) => (
            <span key={flag} className="rounded-md bg-accent-light px-2 py-0.5 text-accent">
              {DIETARY_FLAG_LABELS[flag]}
            </span>
          ))}
        </div>
      </div>

      {r.nutrition && (
        <div className="mb-8">
          <NutritionBadge nutrition={r.nutrition} />
        </div>
      )}

      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold text-text">Ingredients</h2>
        <ul className="space-y-1.5">
          {r.ingredients.map((ing, i) => (
            <li key={i} className="text-text-secondary">
              <span className="font-medium text-text">
                {ing.quantity !== null && `${ing.quantity} `}
                {ing.unit && `${ing.unit} `}
              </span>
              {ing.name}
              {ing.preparation && <span className="text-text-muted">, {ing.preparation}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-display text-lg font-semibold text-text">Instructions</h2>
        <ol className="list-decimal space-y-3 pl-5">
          {r.instructions.map((step, i) => (
            <li key={i} className="leading-relaxed text-text-secondary">{step}</li>
          ))}
        </ol>
      </section>

      {r.sourceUrl && (
        <div className="border-t border-border pt-4">
          <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary transition-colors hover:text-primary-dark">
            View original recipe &rarr;
          </a>
        </div>
      )}
    </>
  );
}
