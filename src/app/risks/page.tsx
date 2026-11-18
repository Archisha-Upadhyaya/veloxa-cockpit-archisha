import RisksView from "@/components/RisksView";

export default function RisksPage() {
  return (
    <main className="mx-auto w-full max-w-[1100px] px-5 py-8 lg:px-10 lg:py-10">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[var(--accent)]">The full brief</p>
      <h1 className="mt-2 mb-6 font-serif text-4xl tracking-[-.04em]">Everything going wrong, and right</h1>
      <RisksView />
    </main>
  );
}
