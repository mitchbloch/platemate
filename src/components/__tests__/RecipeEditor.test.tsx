// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import RecipeEditor, { fromEditableRecipe, toEditableRecipe, type EditableRecipe } from "../RecipeEditor";
import type { ParsedRecipe } from "@/lib/types";

const parsed: ParsedRecipe = {
  title: "Yogurt Bowl",
  description: null,
  cuisine: "other",
  mealType: "breakfast",
  difficulty: "easy",
  servings: 2,
  totalTimeMinutes: 5,
  ingredients: [
    { name: "FAGE greek yogurt", quantity: 1, unit: "cup", preparation: null, category: "dairy", raw: "1 cup FAGE greek yogurt" },
    { name: "honey", quantity: 1, unit: "tbsp", preparation: null, category: "condiment", raw: "1 tbsp honey" },
  ],
  instructions: ["Scoop", "Drizzle"],
  nutrition: { calories: 1, protein: 1, carbs: 1, fat: 1, saturatedFat: 1, cholesterol: 1, fiber: 1, sodium: 1 },
  dietaryFlags: [],
  tags: ["quick"],
  imageUrl: null,
  isSlowCooker: false,
  sourceName: null,
};

function Harness({ onState }: { onState: (r: EditableRecipe) => void }) {
  const [value, setValue] = useState(() => toEditableRecipe(parsed));
  onState(value);
  return <RecipeEditor value={value} onChange={setValue} />;
}

function renderEditor() {
  let latest: EditableRecipe | null = null;
  render(<Harness onState={(r) => (latest = r)} />);
  return () => fromEditableRecipe(latest!);
}

describe("RecipeEditor", () => {
  it("round-trips a parsed recipe through toEditable/fromEditable unchanged", () => {
    const editable = toEditableRecipe(parsed);
    expect(editable.ingredients.map((i) => i.key)).toHaveLength(2);
    expect(new Set(editable.ingredients.map((i) => i.key)).size).toBe(2);
    const { title, description, cuisine, mealType, difficulty, servings, totalTimeMinutes, ingredients, instructions, tags, isSlowCooker } = parsed;
    expect(fromEditableRecipe(editable)).toEqual({ title, description, cuisine, mealType, difficulty, servings, totalTimeMinutes, ingredients, instructions, tags, isSlowCooker });
  });

  it("changing the meal type is reflected in the saved payload", async () => {
    const user = userEvent.setup();
    const result = renderEditor();
    await user.selectOptions(screen.getByLabelText("Meal Type"), "dinner");
    expect(result().mealType).toBe("dinner");
  });

  it("editing an ingredient name updates the structured field and regenerates raw", async () => {
    const user = userEvent.setup();
    const result = renderEditor();
    const name = screen.getByLabelText("Ingredient 1 name");
    await user.clear(name);
    await user.type(name, "greek yogurt");
    const ing = result().ingredients[0];
    expect(ing.name).toBe("greek yogurt");
    expect(ing.raw).toBe("1 cup greek yogurt");
    expect(ing.quantity).toBe(1);
    expect(ing.unit).toBe("cup");
  });

  it("editing quantity and unit regenerates raw including prep notes", async () => {
    const user = userEvent.setup();
    const result = renderEditor();
    await user.click(screen.getByRole("button", { name: /Dairy & Eggs · edit/ }));
    await user.type(screen.getByLabelText("Ingredient 1 preparation"), "plain");
    const qty = screen.getByLabelText("Ingredient 1 quantity");
    await user.clear(qty);
    await user.type(qty, "2{Enter}");
    const ing = result().ingredients[0];
    expect(ing.quantity).toBe(2);
    expect(ing.preparation).toBe("plain");
    expect(ing.raw).toBe("2 cup FAGE greek yogurt, plain");
  });

  it("changing the category is saved", async () => {
    const user = userEvent.setup();
    const result = renderEditor();
    await user.click(screen.getByRole("button", { name: /Condiments & Sauces · edit/ }));
    await user.selectOptions(screen.getByLabelText("Ingredient 2 category"), "other");
    expect(result().ingredients[1].category).toBe("other");
  });

  it("removing the first ingredient keeps the second one's values intact", async () => {
    const user = userEvent.setup();
    const result = renderEditor();
    await user.click(screen.getByRole("button", { name: "Remove ingredient 1" }));
    const ings = result().ingredients;
    expect(ings).toHaveLength(1);
    expect(ings[0].name).toBe("honey");
    expect(screen.getByLabelText("Ingredient 1 name")).toHaveValue("honey");
  });

  it("adds and edits instruction steps", async () => {
    const user = userEvent.setup();
    const result = renderEditor();
    await user.click(screen.getByRole("button", { name: "+ Add step" }));
    await user.type(screen.getByLabelText("Step 3"), "Eat");
    await user.click(screen.getByRole("button", { name: "Remove step 1" }));
    expect(result().instructions).toEqual(["Drizzle", "Eat"]);
  });

  it("parses comma-separated tags on blur", async () => {
    const user = userEvent.setup();
    const result = renderEditor();
    const tags = screen.getByLabelText("Tags (comma-separated)");
    await user.clear(tags);
    await user.type(tags, "quick, healthy ,,");
    await user.tab();
    expect(result().tags).toEqual(["quick", "healthy"]);
  });
});
