import Nav from "@/components/Nav";
import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-12">
        <div className="animate-fade-in-up">
          <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight text-text md:text-4xl">
            Welcome to Platemate
          </h1>
          <p className="mb-10 text-lg text-text-secondary">
            Plan your weekly meals, track nutrition, and build grocery lists.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/recipes"
            className="animate-fade-in-up stagger-1 card-hover group rounded-2xl border border-border bg-surface p-6 shadow-warm"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light text-lg text-primary">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>
            </div>
            <h2 className="mb-1.5 font-display text-lg font-semibold text-text group-hover:text-primary transition-colors">
              Recipe Library
            </h2>
            <p className="text-sm leading-relaxed text-text-secondary">
              Browse, import, and manage your recipes with AI-powered nutrition
              tracking.
            </p>
          </Link>

          <Link
            href="/plan"
            className="animate-fade-in-up stagger-2 card-hover group rounded-2xl border border-border bg-surface p-6 shadow-warm"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-light text-lg text-accent">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <h2 className="mb-1.5 font-display text-lg font-semibold text-text group-hover:text-primary transition-colors">
              Meal Plan
            </h2>
            <p className="text-sm leading-relaxed text-text-secondary">
              Get AI suggestions and plan 2-4 dinners plus slow cooker prep each
              week.
            </p>
          </Link>

          <Link
            href="/grocery"
            className="animate-fade-in-up stagger-3 card-hover group rounded-2xl border border-border bg-surface p-6 shadow-warm"
          >
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold-light text-lg text-gold">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
            </div>
            <h2 className="mb-1.5 font-display text-lg font-semibold text-text group-hover:text-primary transition-colors">
              Grocery List
            </h2>
            <p className="text-sm leading-relaxed text-text-secondary">
              Auto-generated lists grouped by store with shared real-time
              checking.
            </p>
          </Link>
        </div>
      </main>
    </>
  );
}
