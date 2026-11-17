"use client";

import { useEffect, useState } from "react";

type Risk = {
  title: string;
  description: string;
  severity: string;
  likelihood: string;
  status: string;
  confidence?: string;
};
type Evidence = { id: string; text: string; source: string; locator: string };
type DetailTab = "assessment" | "evidence" | "action";

export default function RiskDetailView({
  riskKey,
}: {
  riskKey: string;
}) {
  const [risk, setRisk] = useState<Risk | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("assessment");

  useEffect(() => {
    fetch(`/api/risks/${encodeURIComponent(riskKey)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load concern details.");
        setRisk(result.risk);
        setEvidence(result.evidence ?? []);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unable to load concern details."),
      );
  }, [riskKey]);

  if (error) {
    return <main className="mx-auto max-w-3xl px-5 py-12 text-sm text-[var(--muted)]">{error}</main>;
  }
  if (!risk) {
    return <main className="mx-auto max-w-3xl px-5 py-12 text-sm text-[var(--muted)]">Loading concern…</main>;
  }

  return (
    <main className="mx-auto w-full max-w-[1100px] px-5 py-8 lg:px-10 lg:py-12">
      <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[var(--accent)]">Concern detail</p>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-5xl tracking-[-.05em]">{risk.title}</h1>
          <p className="mt-3 text-sm text-[var(--muted)]">
            {risk.severity} severity · {risk.likelihood} likelihood · {risk.status}
          </p>
        </div>
        <span className="pill rounded-full px-3 py-1 text-xs">{risk.confidence ?? "unknown"} confidence</span>
      </div>

      <div className="mt-10 flex gap-2 border-b border-[var(--line)]">
        {([
          ["assessment", "Assessment"],
          ["evidence", "Evidence"],
          ["action", "Suggested action"],
        ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-3 py-3 text-xs font-semibold transition ${
              activeTab === tab
                ? "border-[var(--accent)] text-[var(--accent)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === "assessment" && (
        <section className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">What we think is happening</p>
          <p className="mt-4 text-base leading-8 text-[var(--ink)]">{risk.description}</p>
          <p className="mt-6 text-sm leading-7 text-[var(--muted)]">
            This is an inference from the evidence, not a confirmed conclusion. It should be revisited when newer records are ingested or the relevant people confirm the current situation.
          </p>
        </section>
      )}

      {activeTab === "evidence" && (
        <section className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">Evidence</p>
          <div className="mt-5 space-y-3">
            {evidence.map((item) => (
              <article key={item.id} className="rounded-xl bg-[var(--surface)] p-4">
                <p className="text-sm leading-7 text-[var(--ink)]">{item.text}</p>
                <p className="mt-3 font-mono text-[11px] text-[var(--muted)]">
                  {item.source}{item.locator ? ` · ${item.locator}` : ""}
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {activeTab === "action" && (
        <section className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">Suggested next step</p>
          <p className="mt-4 text-sm leading-7 text-[var(--muted)]">
            Review the records with the relevant owner, confirm what is still current, and record the decision or follow-up action.
          </p>
        </section>
      )}
    </main>
  );
}
