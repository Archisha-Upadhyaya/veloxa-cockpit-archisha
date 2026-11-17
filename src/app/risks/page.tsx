import RisksView from "@/components/RisksView";

export default function RisksPage() {
  return (
    <main className="mx-auto w-full max-w-[1380px] px-5 py-8 lg:px-10 lg:py-10">
      <div className="mb-8 max-w-2xl">
        <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[var(--accent)]">Company / attention</p>
        <h1 className="mt-3 font-serif text-5xl tracking-[-.05em]">The concerns worth carrying.</h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">Open a concern to understand the observed evidence, the inference, and what would close the gap.</p>
      </div>
      <RisksView />
    </main>
  );
}
