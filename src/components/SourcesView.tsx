"use client";

import { useEffect, useState } from "react";

type Source = { id: string; title: string; source_type: string; release_day: string; available_at: string };

export default function SourcesView() {
  const [sources, setSources] = useState<Source[]>([]);
  useEffect(() => {
    fetch("/api/timeline").then((response) => response.json()).then((result) => setSources(result.sources ?? [])).catch((error) => console.error("Sources request failed", error));
  }, []);
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {sources.map((source) => (
        <article id={source.id} key={source.id} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 transition hover:border-[var(--accent)]">
          <p className="font-mono text-xs uppercase tracking-[.12em] text-[var(--accent)]">{source.source_type}</p>
          <h2 className="mt-3 text-base font-semibold">{source.title}</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">Released {source.release_day}</p>
          <p className="mt-4 text-xs text-[var(--muted)]">Available to retrieval from {new Date(source.available_at).toLocaleDateString()}</p>
        </article>
      ))}
      {sources.length === 0 && <p className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 text-sm text-[var(--muted)]">No source records are connected yet.</p>}
    </div>
  );
}
