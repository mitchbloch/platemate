import type { DietaryFlag, DietaryWarning } from "./types";
import { DIETARY_FLAG_LABELS } from "./types";

/**
 * Check a recipe's dietary flags against household dietary preferences.
 * Returns warnings for preferences that the recipe does NOT satisfy.
 *
 * Example: household prefers "dairy-free", recipe flags are ["vegetarian", "gluten-free"]
 * → warning: "This recipe may not be dairy-free"
 */
export function checkDietaryConflicts(
  recipeDietaryFlags: DietaryFlag[],
  householdPreferences: string[],
): DietaryWarning[] {
  if (householdPreferences.length === 0) return [];

  const recipeFlags = new Set(recipeDietaryFlags);
  const warnings: DietaryWarning[] = [];

  for (const pref of householdPreferences) {
    if (!recipeFlags.has(pref as DietaryFlag)) {
      const label = DIETARY_FLAG_LABELS[pref as DietaryFlag] ?? pref;
      warnings.push({
        preference: pref,
        message: `This recipe may not be ${label.toLowerCase()}`,
      });
    }
  }

  return warnings;
}
