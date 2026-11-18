import type { Metadata } from "next";
import SourcesView from "@/components/SourcesView";

export const metadata: Metadata = {
  title: "Documents",
  description: "The documents the brief is built from.",
};

export default function SourcesPage() {
  return (
    <main className="mx-auto w-full max-w-[1100px] px-5 py-8 lg:px-10 lg:py-10">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[var(--accent)]">Documents</p>
      <h1 className="mt-2 mb-8 font-serif text-4xl tracking-[-.04em]">Everything the brief is built from</h1>
      <SourcesView />
    </main>
  );
}
