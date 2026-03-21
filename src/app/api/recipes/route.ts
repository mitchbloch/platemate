import { NextRequest, NextResponse } from "next/server";
import { listRecipes, createRecipe } from "@/lib/recipes";

export async function GET() {
  try {
    const recipes = await listRecipes();
    return NextResponse.json(recipes);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch recipes";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.title || !body.ingredients || !body.instructions) {
      return NextResponse.json(
        { error: "Missing required fields: title, ingredients, instructions" },
        { status: 400 },
      );
    }

    const id = await createRecipe(body);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create recipe";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
