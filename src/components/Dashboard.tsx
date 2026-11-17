"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";

type Risk = {
  id: string;
  risk_key: string;
  title: string;
  description: string;
  severity: string;
  likelihood: string;
  status: string;
  summary?: string;
};
type Source = { id: string; title: string; source_type: string; release_day: string };
type DashboardData = {
  stats: { people: number; evidence: number; embedded: number; departments: Record<string, number> };
  latestSources: Source[];
  priorityRisks: Risk[];
  analysisReady?: boolean;
};
type EvidenceHit = { evidence_id: string; evidence_text: string; similarity: number; source_title: string; locator: string };

const emptyData: DashboardData = {
  stats: { people: 0, evidence: 0, embedded: 0, departments: {} },
  latestSources: [],
  priorityRisks: [],
  analysisReady: false,
};

function isDashboardData(value: unknown): value is DashboardData {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<DashboardData>;
  return Boolean(
    candidate.stats &&
      typeof candidate.stats.people === "number" &&
      typeof candidate.stats.evidence === "number" &&
      typeof candidate.stats.embedded === "number" &&
      candidate.stats.departments &&
      Array.isArray(candidate.latestSources) &&
      Array.isArray(candidate.priorityRisks),
  );
}

function severityTone(severity: string) {
  if (severity === "critical" || severity === "high") return "text-[var(--critical)] bg-[#f3dfdb]";
  if (severity === "medium") return "text-[var(--warning)] bg-[#f1e5d7]";
  return "text-[var(--accent)] bg-[var(--accent-soft)]";
}

export default function Dashboard() {
  const [data, setData] = useState(emptyData);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<EvidenceHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (response) => {
        const result: unknown = await response.json();
        if (!response.ok || !isDashboardData(result)) {
          const message =
            result &&
            typeof result === "object" &&
            "error" in result &&
            typeof result.error === "string"
              ? result.error
              : "Dashboard data is unavailable.";
          throw new Error(message);
        }
        setData(result);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        console.error("Dashboard request failed", error);
        setLoadError(
          error instanceof Error ? error.message : "Dashboard data is unavailable.",
        );
      })
      .finally(() => setLoading(false));
  }, []);

  const coverage = useMemo(
    () => (data.stats.evidence ? Math.round((data.stats.embedded / data.stats.evidence) * 100) : 0),
    [data.stats],
  );
  const visibleSources = data.latestSources.slice(0, 3);

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      const response = await fetch("/api/retrieve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const result = await response.json();
      setHits(result.evidence ?? []);
    } catch (error) {
      console.error("Evidence search failed", error);
    } finally {
      setSearching(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1380px] px-5 py-8 lg:px-10 lg:py-12">
      <section className="reveal">
        {loadError && (
          <div className="mb-5 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--muted)]" role="status">
            {loadError} Showing an empty view until the connection is available.
          </div>
        )}
        {data.analysisReady === false && !loadError && (
          <div className="mb-5 rounded-xl border border-[var(--line)] bg-[var(--paper)] px-4 py-3 text-sm text-[var(--muted)]" role="status">
            Risk analysis is waiting for the latest database migration. The connected records remain available.
          </div>
        )}
        <div>
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.2em] text-[var(--accent)]">
            Executive overview · connected evidence
          </p>
          <h1 className="max-w-3xl font-serif text-5xl leading-[.98] tracking-[-0.055em] text-[var(--ink)] sm:text-7xl">
            See what matters.<br /><em className="text-[var(--accent)]">Know why.</em>
          </h1>
          <p className="mt-6 max-w-4xl text-[15px] leading-7 text-[var(--muted)]">
            A quiet layer between Veloxa&apos;s records and the decisions in front of you.
            Start with the signal, then open the trail.
          </p>
        </div>
      </section>

      <section className="reveal reveal-delay mt-12 grid gap-3 sm:grid-cols-3">
        {[
          ["People in view", data.stats.people, "active profiles"],
          ["Evidence loaded", data.stats.evidence, `${coverage}% vector-ready`],
          ["Open concerns", data.priorityRisks.length, "worth your attention"],
        ].map(([label, value, note]) => (
          <Link
            key={label}
            href={label === "People in view" ? "/people" : label === "Open concerns" ? "/risks" : "/sources"}
            className="group rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-[0_10px_24px_rgba(47,55,48,.08)]"
          >
            <p className="text-sm text-[var(--muted)]">{label}</p>
            <p className="mt-3 font-serif text-5xl tracking-[-.05em]">{loading ? "—" : value}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[.12em] text-[var(--accent)]">{note}</p>
            <span className="mt-4 block text-xs text-[var(--muted)] transition group-hover:text-[var(--accent)]">Open detail →</span>
          </Link>
        ))}
      </section>

      <section className="reveal reveal-delay-2 mt-4 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">Evidence search</p>
            <h2 className="mt-2 font-serif text-3xl tracking-[-.03em]">Ask what the records support</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--muted)]">
              Search the connected evidence before opening a source or making a decision.
            </p>
          </div>
          <form onSubmit={search} className="flex w-full max-w-xl items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-2">
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search connected evidence…" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--muted)]" />
            <button disabled={searching} className="rounded-lg bg-[var(--ink)] px-4 py-2.5 text-xs text-[var(--paper)] transition hover:bg-[var(--accent)] disabled:opacity-50">
              {searching ? "Looking…" : "Search"}
            </button>
          </form>
        </div>
        {hits.length > 0 && (
          <div className="mt-5 border-t border-[var(--line)] pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-[.16em] text-[var(--muted)]">Evidence trail</p>
            <div className="grid gap-2 lg:grid-cols-3">
              {hits.slice(0, 3).map((hit) => (
                <article key={hit.evidence_id} className="rounded-xl bg-[var(--surface)] p-3">
                  <p className="text-sm leading-6 text-[var(--ink)]">{hit.evidence_text}</p>
                  <p className="mt-2 font-mono text-[11px] text-[var(--muted)]">{hit.source_title} · {hit.locator}</p>
                </article>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="reveal reveal-delay-2 mt-4 grid gap-4 lg:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 sm:p-7">
          <div className="flex w-full items-start justify-between text-left">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">Attention map</p>
              <h2 className="mt-2 font-serif text-3xl tracking-[-.03em]">What needs a closer look</h2>
            </div>
            <span className="pill rounded-full px-3 py-1.5 text-xs">{data.priorityRisks.length} signals</span>
          </div>
          <div className="mt-6 space-y-2">
            {data.priorityRisks.length === 0 && <p className="rounded-xl bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">No open concerns have been loaded yet.</p>}
            {data.priorityRisks.map((risk, index) => (
              <div key={risk.id} className="rounded-xl border border-transparent bg-[var(--surface)] p-4 transition hover:border-[var(--line)]">
                <div className="flex gap-4">
                  <span className="font-serif text-2xl text-[var(--muted)]">0{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <strong className="text-sm font-medium">{risk.title}</strong>
                      <span className={`rounded-full px-2 py-1 text-[9px] uppercase tracking-[.12em] ${severityTone(risk.severity)}`}>{risk.severity}</span>
                    </span>
                  </span>
                </div>
                <Link
                  href={`/risks/${encodeURIComponent(risk.risk_key)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 ml-10 inline-block text-xs font-semibold text-[var(--accent)] hover:underline"
                >
                  Why this matters →
                </Link>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 sm:p-7">
          <div className="flex w-full items-start justify-between text-left">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">Evidence desk</p>
              <h2 className="mt-2 font-serif text-3xl tracking-[-.03em]">What is in the room</h2>
            </div>
            <span className="pill rounded-full px-3 py-1.5 text-xs">{visibleSources.length} records</span>
          </div>
          <div className="mt-6 space-y-2">
            {visibleSources.map((source) => (
              <div key={source.id} className="rounded-xl bg-[var(--surface)] p-4">
                <p className="text-sm font-semibold text-[var(--ink)]">{source.title}</p>
                <p className="mt-2 text-xs text-[var(--muted)]">{source.source_type} · released {source.release_day}</p>
              </div>
            ))}
            {data.latestSources.length === 0 && <p className="rounded-xl bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">No source records are connected yet.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5 sm:p-7 lg:col-span-2">
          <div className="flex w-full items-start justify-between text-left">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]">Company shape</p>
              <h2 className="mt-2 font-serif text-3xl tracking-[-.03em]">Where the people sit</h2>
            </div>
            <span className="pill rounded-full px-3 py-1.5 text-xs">{Object.keys(data.stats.departments).length} teams</span>
          </div>
          <div className="mt-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(data.stats.departments).map(([name, count]) => (
              <Link key={name} href="/people" className="rounded-xl bg-[var(--surface)] p-4 transition hover:bg-[var(--accent-soft)]">
                <p className="text-sm font-semibold">{name}</p>
                <p className="mt-3 font-serif text-3xl">{count}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{count === 1 ? "person" : "people"} in connected profiles</p>
                <p className="mt-3 text-xs font-semibold text-[var(--accent)]">Open people directory →</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
