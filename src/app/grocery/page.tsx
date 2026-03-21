import Nav from "@/components/Nav";

export default function GroceryPage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Grocery List</h1>
        <p className="text-gray-600">
          Auto-generated grocery lists coming in Phase 4.
        </p>
      </main>
    </>
  );
}
