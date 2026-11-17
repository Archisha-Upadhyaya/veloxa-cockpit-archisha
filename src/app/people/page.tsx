import PeopleDirectory from "@/components/people/PeopleDirectory";

export default function PeoplePage() {
  return (
    <main className="people-page mx-auto w-full max-w-[1380px] flex-1 px-5 py-8 lg:px-10 lg:py-10">
      <div className="mb-8 max-w-2xl">
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[var(--accent)]">People / context</p>
        <h1 className="mt-3 font-serif text-5xl tracking-[-.05em]">The room behind the numbers.</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Talk to people across the company without losing the line between what they know and what they don&apos;t.</p>
      </div>
      <PeopleDirectory />
    </main>
  );
}
