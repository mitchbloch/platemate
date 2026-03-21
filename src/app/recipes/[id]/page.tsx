import Nav from "@/components/Nav";
import RecipeDetail from "@/components/RecipeDetail";
import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import type { Recipe } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    notFound();
  }

  const recipe = data as unknown as Recipe;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <RecipeDetail recipe={recipe} />
      </main>
    </>
  );
}
