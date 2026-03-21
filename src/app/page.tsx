import Nav from "@/components/Nav";
import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Welcome to Platemate
        </h1>
        <p className="mb-8 text-lg text-gray-600">
          Plan your weekly meals, track nutrition, and build grocery lists.
        </p>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/recipes"
            className="group rounded-xl border border-gray-200 p-6 transition-colors hover:border-primary hover:bg-primary/5"
          >
            <h2 className="mb-2 text-lg font-semibold text-gray-900 group-hover:text-primary">
              Recipe Library
            </h2>
            <p className="text-sm text-gray-600">
              Browse, import, and manage your recipes with AI-powered nutrition
              tracking.
            </p>
          </Link>

          <Link
            href="/plan"
            className="group rounded-xl border border-gray-200 p-6 transition-colors hover:border-primary hover:bg-primary/5"
          >
            <h2 className="mb-2 text-lg font-semibold text-gray-900 group-hover:text-primary">
              Meal Plan
            </h2>
            <p className="text-sm text-gray-600">
              Get AI suggestions and plan 2-4 dinners plus slow cooker prep each
              week.
            </p>
          </Link>

          <Link
            href="/grocery"
            className="group rounded-xl border border-gray-200 p-6 transition-colors hover:border-primary hover:bg-primary/5"
          >
            <h2 className="mb-2 text-lg font-semibold text-gray-900 group-hover:text-primary">
              Grocery List
            </h2>
            <p className="text-sm text-gray-600">
              Auto-generated lists grouped by store with shared real-time
              checking.
            </p>
          </Link>
        </div>
      </main>
    </>
  );
}
