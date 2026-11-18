import type { Metadata } from "next";
import RisksView from "@/components/RisksView";

export const metadata: Metadata = {
  title: "Concerns",
  description: "Every open concern, with its evidence and who to talk to.",
};

export default function RisksPage() {
  return (
    <main className="mx-auto w-full max-w-[1100px] px-5 py-8 lg:px-10 lg:py-10">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[var(--accent)]">Concerns</p>
      <h1 className="mt-2 mb-6 font-serif text-4xl tracking-[-.04em]">Everything that needs your attention</h1>
      <RisksView />
    </main>
  );
}
