"use client";

import { useEffect, useState } from "react";
import PageLoader from "@/components/PageLoader";

type Source = { id: string; title: string; source_type: string; release_day: string; available_at: string };

export default function SourcesView() {
  const [sources, setSources] = useState<Source[] | null>(null);
  useEffect(() => {
    fetch("/api/timeline")
      .then((response) => response.json())
      .then((result) => setSources(result.sources ?? []))
      .catch((error) => {
        console.error("Sources request failed", error);
        setSources([]);
      });
  }, []);
  if (sources === null) return <PageLoader lines={["Loading documents"]} />;
  return (
    <>
    <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[var(--accent)]">Documents</p>
    <h1 className="mt-2 mb-8 font-serif text-4xl tracking-[-.04em]">Everything the brief is built from</h1>
    <div className="grid gap-4 sm:grid-cols-2">
      {sources.map((source) => (
        <article id={source.id} key={source.id} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 transition hover:border-[var(--accent)]">
          <p className="font-mono text-xs uppercase tracking-[.12em] text-[var(--accent)]">{source.source_type}</p>
          <h2 className="mt-3 text-base font-semibold">{source.title}</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Added {new Date(source.available_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </article>
      ))}
      {sources.length === 0 && <p className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 text-sm text-[var(--muted)]">No documents loaded yet.</p>}
    </div>
    </>
  );
}
