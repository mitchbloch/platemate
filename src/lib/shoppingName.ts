/**
 * The brand-agnostic grocery name for an ingredient — what you'd write on a
 * paper shopping list. Produced by Claude at import (and by the one-time
 * backfill) and used as the grocery-merge key so "FAGE 100% greek yoghurt"
 * and "plain greek yogurt" become one line: "greek yogurt".
 */

export const SHOPPING_NAME_RULES = `For each ingredient also return "shoppingName": the generic grocery item you would write on a shopping list. Rules:
- Lowercase, singular, 1–4 words. Never empty.
- Drop brand names, marketing words (100%, natural, premium, farm-fresh), organic/free-range, sizes (large, small, jumbo) and counts.
- Drop fat level on milk and yogurt unless the recipe truly depends on it (whipping cream, a custard that needs whole milk): "2% milk" → "milk", "whole milk" → "milk", "nonfat greek yogurt" → "greek yogurt".
- KEEP anything you would shop differently for: form (canned vs fresh vs frozen), cut (chicken thighs vs chicken breast), type (greek yogurt vs yogurt, heavy cream vs milk, red onion vs onion), and dried vs fresh herbs.
- Never substitute a different ingredient: "red onion" is not "green onion", "paprika" is not "smoked paprika" unless the source line says smoked, ground coriander (a spice) is not cilantro. When the name is blank, derive it from the source line.
Examples: "FAGE 100% greek yoghurt" → "greek yogurt"; "2% milk" → "milk"; "heavy whipping cream" → "heavy cream"; "boneless skinless chicken thighs" → "chicken thighs"; "San Marzano canned tomatoes" → "canned tomatoes"; "1 large yellow onion" → "onion"; "extra-virgin olive oil" → "olive oil"; "fresh basil leaves" → "basil".`;

const MAX_LENGTH = 60;

/** Trim, lowercase, and cap a model-produced shopping name; empty → null. */
export function normalizeShoppingName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().toLowerCase().replace(/\s+/g, " ");
  if (!cleaned) return null;
  return cleaned.slice(0, MAX_LENGTH);
}
