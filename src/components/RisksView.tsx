"use client";

import { useEffect, useState } from "react";

type Risk = { id: string; risk_key: string; title: string; description: string; severity: string; likelihood: string; status: string };

export default function RisksView() {
  const [risks, setRisks] = useState<Risk[]>([]);
  useEffect(() => {
    fetch("/api/risks").then((response) => response.json()).then((result) => setRisks(result.risks ?? [])).catch((error) => console.error("Risks request failed", error));
  }, []);
  return (
    <div className="space-y-3">
      {risks.map((risk) => (
        <article id={risk.risk_key} key={risk.id} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-2xl tracking-[-.03em]">{risk.title}</h2>
            <span className="pill rounded-full px-3 py-1 text-xs">{risk.severity} · {risk.likelihood} likelihood</span>
          </div>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-[var(--muted)]">{risk.description}</p>
          <p className="mt-4 text-xs font-semibold uppercase tracking-[.12em] text-[var(--accent)]">Status: {risk.status}</p>
        </article>
      ))}
      {risks.length === 0 && <p className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 text-sm text-[var(--muted)]">No open concerns are connected yet.</p>}
    </div>
  );
}
