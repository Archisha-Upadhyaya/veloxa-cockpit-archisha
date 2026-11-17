"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Risk = {
  id: string;
  risk_key: string;
  title: string;
  description: string;
  severity: string;
  likelihood: string;
  status: string;
  confidence?: string | null;
  origin?: string | null;
};

export default function RisksView() {
  const [risks, setRisks] = useState<Risk[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/risks")
      .then((response) => response.json())
      .then((result) => setRisks(result.risks ?? []))
      .catch((error) => console.error("Risks request failed", error))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-3">
      {loading && (
        <p className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 text-sm text-[var(--muted)]">
          Loading concerns…
        </p>
      )}
      {!loading && risks.length > 0 && (
        <p className="mb-4 text-xs uppercase tracking-[.14em] text-[var(--muted)]">
          {risks.length} open {risks.length === 1 ? "concern" : "concerns"} · ordered by severity
        </p>
      )}
      {risks.map((risk) => (
        <article
          id={risk.risk_key}
          key={risk.id}
          className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 transition hover:border-[var(--accent)]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="max-w-3xl font-serif text-2xl tracking-[-.03em]">
              {risk.title}
            </h2>
            <span className="pill rounded-full px-3 py-1 text-xs">
              {risk.severity} · {risk.likelihood} likelihood
            </span>
          </div>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-[var(--muted)]">
            {risk.description}
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[.12em] text-[var(--accent)]">
              Status: {risk.status}
              {risk.confidence ? ` · ${risk.confidence} confidence` : ""}
            </p>
            <Link
              href={`/risks/${encodeURIComponent(risk.risk_key)}`}
              className="text-xs font-semibold text-[var(--accent)] hover:underline"
            >
              Open concern detail →
            </Link>
          </div>
        </article>
      ))}
      {!loading && risks.length === 0 && (
        <p className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 text-sm text-[var(--muted)]">
          No open concerns yet.
        </p>
      )}
    </div>
  );
}
