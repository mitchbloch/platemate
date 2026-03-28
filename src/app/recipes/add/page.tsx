"use client";

import Nav from "@/components/Nav";
import RecipeForm from "@/components/RecipeForm";

export default function AddRecipePage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="mb-6 font-display text-2xl font-semibold tracking-tight text-text">
          Add Recipe
        </h1>
        <RecipeForm />
      </main>
    </>
  );
}
