import SourcesView from "@/components/SourcesView";

export default function SourcesPage() {
  return (
    <main className="mx-auto w-full max-w-[1380px] px-5 py-8 lg:px-10 lg:py-10">
      <div className="mb-8 max-w-2xl">
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[var(--accent)]">Company / records</p>
        <h1 className="mt-3 font-serif text-5xl tracking-[-.05em]">What is in the room.</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">A source-first view of the records currently available to the cockpit.</p>
      </div>
      <SourcesView />
    </main>
  );
}
