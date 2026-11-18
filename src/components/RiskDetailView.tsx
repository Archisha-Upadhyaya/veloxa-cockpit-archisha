"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AreaPill, ConfidencePill, SeverityPill } from "@/components/pills";

type Risk = {
  title: string;
  description: string;
  severity: string;
  likelihood: string;
  status: string;
  confidence?: string | null;
  observed?: string | null;
  inference?: string | null;
  recommended_action?: string | null;
  polarity?: string | null;
  area?: string | null;
  last_reviewed_at?: string | null;
};
type Evidence = {
  id: string;
  summary: string;
  why?: string | null;
  tier?: string;
  source: string;
  locator: string;
  dateLabel?: string;
};
type Owner = { empId: string; name: string; title: string; department: string } | null;

export default function RiskDetailView({ riskKey }: { riskKey: string }) {
  const [risk, setRisk] = useState<Risk | null>(null);
  const [owner, setOwner] = useState<Owner>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/risks/${encodeURIComponent(riskKey)}`)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load this item.");
        setRisk(result.risk);
        setOwner(result.owner ?? null);
        setEvidence(result.evidence ?? []);
        setNotice(result.notice ?? null);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unable to load this item."),
      );
  }, [riskKey]);

  if (error) return <main className="mx-auto max-w-3xl px-5 py-12 text-sm text-[var(--muted)]">{error}</main>;
  if (!risk) return <main className="mx-auto max-w-3xl px-5 py-12 text-sm text-[var(--muted)]">Loading…</main>;

  const positive = risk.polarity === "positive";
  const chatHref = owner
    ? `/people?${new URLSearchParams({ chat: owner.empId, about: risk.title }).toString()}`
    : null;

  return (
    <main className="mx-auto w-full max-w-[920px] px-5 py-8 lg:py-10">
      <Link href="/risks" className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">← All items</Link>

      <header className={`mt-4 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 sm:p-8 ${positive ? "border-l-4 border-l-[var(--good)]" : `detail-header sev-${risk.severity}`}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          {positive ? <span className="pill-good">✓ going well</span> : <SeverityPill severity={risk.severity} />}
          {risk.area && <AreaPill area={risk.area} all={[]} />}
          <ConfidencePill confidence={risk.confidence} />
          <span className="text-[11px] text-[var(--muted)]">
            · {evidence.length} supporting {evidence.length === 1 ? "record" : "records"}
            {risk.last_reviewed_at ? ` · reviewed ${new Date(risk.last_reviewed_at).toLocaleDateString(undefined, { day: "numeric", month: "short" })}` : ""}
          </span>
        </div>
        <h1 className="mt-3 font-serif text-3xl leading-tight tracking-[-.03em] sm:text-4xl">{risk.title}</h1>

        {owner && chatHref && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface)] p-3">
            <p className="text-sm">
              <span className="text-[var(--muted)]">Best person to talk to: </span>
              <strong>{owner.name}</strong>
              <span className="text-[var(--muted)]"> · {owner.title}</span>
            </p>
            <Link href={chatHref} className="talk-button">Talk to {owner.name.split(" ")[0]} →</Link>
          </div>
        )}
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
          <p className="section-eyebrow text-[var(--accent)]">What the records show</p>
          <p className="mt-2 text-[15px] leading-7">{risk.observed ?? risk.description}</p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
          <p className={`section-eyebrow ${positive ? "text-[var(--good)]" : "text-[var(--critical)]"}`}>
            {positive ? "Why it matters" : "Why it matters, and what's uncertain"}
          </p>
          <p className="mt-2 text-[15px] leading-7">{risk.inference ?? "No interpretation was recorded for this item."}</p>
        </div>
      </section>

      {risk.recommended_action && (
        <section className="mt-4 rounded-2xl border border-[var(--accent)] bg-[var(--accent-soft)] p-6">
          <p className="section-eyebrow text-[var(--accent)]">{positive ? "How to build on it" : "Suggested next step"}</p>
          <p className="mt-2 text-[15px] leading-7">{risk.recommended_action}</p>
        </section>
      )}

      <section className="mt-10 mb-8">
        <p className="section-eyebrow text-[var(--muted)]">Evidence, and why it counts</p>
        <div className="mt-4 flex flex-col gap-3">
          {evidence.map((item, index) => (
            <article key={item.id} className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="cite-pill" style={{ verticalAlign: "middle" }}>{index + 1}</span>
                <span className="text-sm font-semibold">{item.source}</span>
                <span className={item.tier === "secondary" ? "type-pill" : "pill-good"}>
                  {item.tier === "secondary" ? "call transcript" : "company record"}
                </span>
                {item.dateLabel && <span className="text-[11px] text-[var(--muted)]">{item.dateLabel}</span>}
              </div>
              <p className="mt-3 text-sm leading-7">“{item.summary}”</p>
              {item.why && <p className="why-line mt-3"><strong>Why this counts: </strong>{item.why}</p>}
            </article>
          ))}
          {evidence.length === 0 && (
            <p className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-4 text-sm text-[var(--muted)]">
              {notice ?? "No supporting record can be shown for this item."}
            </p>
          )}
          {notice && evidence.length > 0 && <p className="text-xs text-[var(--muted)]">{notice}</p>}
        </div>
      </section>
    </main>
  );
}
