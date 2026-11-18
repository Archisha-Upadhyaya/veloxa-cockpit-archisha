"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useNow } from "@/components/useNow";
import { areaColor, ConfidencePill, SeverityPill, AreaPill, StatusDot } from "@/components/pills";

type Finding = {
  id: string;
  risk_key: string;
  title: string;
  description: string;
  observed?: string | null;
  inference?: string | null;
  recommended_action?: string | null;
  polarity?: string | null;
  area?: string | null;
  owner_employee_key?: string | null;
  severity: string;
  confidence?: string | null;
  evidence_count?: number | null;
};
type Source = { id: string; title: string; source_type: string; release_day: string };
type Brief = {
  ceo: { name: string; title: string } | null;
  stats: { people: number; evidence: number; sources: number; departments: Record<string, number> };
  concerns: Finding[];
  positives: Finding[];
  latestDay: string | null;
  newSources: Source[];
  lastAnalysis: { at: string; model: string | null } | null;
};
type Person = { empId: string; name: string; title: string; department: string; isActive: boolean };
type AskSource = { n: number; id: string; summary: string; source: string; date: string | null };
/** answer is null while the reply is on its way. */
type AskTurn = { question: string; answer: string | null; sources: AskSource[]; mode?: string };
type HealthArea = {
  area: string;
  status: "good" | "watch" | "act" | "unknown";
  headline: string;
  why: string;
  evidence: Array<{ summary: string; source: string; tier: string }>;
  findings: Array<{ key: string; title: string; polarity: string | null }>;
  contact: { empId: string; name: string; title: string } | null;
  people: number;
};

function greeting(date: Date) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function chatLink(empId: string, about?: string) {
  const params = new URLSearchParams({ chat: empId });
  if (about) params.set("about", about);
  return `/people?${params.toString()}`;
}

/** Render "[2]" citations as small numbered pills. */
function withCitations(text: string, onCite: (n: number) => void): ReactNode[] {
  return text.split(/(\[\d+(?:\s*,\s*\d+)*\])/g).map((part, index) => {
    const match = part.match(/^\[([\d,\s]+)\]$/);
    if (!match) return <Fragment key={index}>{part}</Fragment>;
    return (
      <Fragment key={index}>
        {match[1].split(",").map((value) => {
          const n = Number(value.trim());
          return (
            <button key={n} type="button" onClick={() => onCite(n)} className="cite-pill" aria-label={`Source ${n}`}>
              {n}
            </button>
          );
        })}
      </Fragment>
    );
  });
}

export default function Dashboard() {
  const [brief, setBrief] = useState<Brief | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);
  const now = useNow();

  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [asking, setAsking] = useState(false);
  const [openCite, setOpenCite] = useState<string | null>(null);
  const threadEnd = useRef<HTMLDivElement>(null);

  const [health, setHealth] = useState<{ areas: HealthArea[]; checkedAt: string; mode: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [openArea, setOpenArea] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard").then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "The brief is unavailable.");
        return body as Brief;
      }),
      fetch("/api/people").then((response) => response.json()).catch(() => ({ people: [] })),
    ])
      .then(([briefData, peopleData]) => {
        setBrief(briefData);
        setPeople(peopleData.people ?? []);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "The brief is unavailable."));
  }, []);

  useEffect(() => {
    if (turns.length) threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns, asking]);

  const personByKey = useMemo(() => new Map(people.map((person) => [person.empId, person])), [people]);
  const departments = useMemo(() => Object.keys(brief?.stats.departments ?? {}).sort(), [brief]);
  const firstName = brief?.ceo?.name.split(" ")[0];

  // Suggestions are built from what is on the brief today, not a fixed list.
  const suggestions = useMemo(() => {
    if (!brief) return [];
    const fromConcerns = brief.concerns.slice(0, 2).map((finding) => `What's behind "${finding.title}"?`);
    const fromAreas = departments.slice(0, 6).filter((area) => area !== "Leadership").slice(0, 2).map((area) => `How is ${area} doing?`);
    return [...fromConcerns, ...fromAreas, "Who reports to whom?"];
  }, [brief, departments]);

  async function ask(text: string, event?: FormEvent) {
    event?.preventDefault();
    const current = text.trim();
    if (!current || asking) return;
    setQuestion("");
    setAsking(true);
    // Show the CEO's question immediately; the answer fills in when it arrives.
    const history = turns
      .filter((turn) => turn.answer !== null)
      .slice(-4)
      .map((turn) => ({ question: turn.question, answer: turn.answer as string }));
    setTurns((existing) => [...existing, { question: current, answer: null, sources: [] }]);
    const settle = (turn: Omit<AskTurn, "question">) =>
      setTurns((existing) =>
        existing.map((entry, index) =>
          index === existing.length - 1 && entry.answer === null ? { ...entry, ...turn } : entry,
        ),
      );
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: current,
          history,
        }),
      });
      const body = await response.json();
      settle({
        answer: body.answer ?? body.error ?? "No answer came back. Try again.",
        sources: body.sources ?? [],
        mode: body.mode,
      });
    } catch {
      settle({ answer: "I couldn't reach the server. Try again in a moment.", sources: [] });
    } finally {
      setAsking(false);
    }
  }

  async function runHealthCheck() {
    setChecking(true);
    try {
      const response = await fetch("/api/health-check", { method: "POST" });
      const body = await response.json();
      if (response.ok) setHealth(body);
    } finally {
      setChecking(false);
    }
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 text-sm text-[var(--muted)]">{error}</p>
      </main>
    );
  }

  const top = brief?.concerns.slice(0, 3) ?? [];
  const summaryLine = brief
    ? [
        brief.concerns.length
          ? `${brief.concerns.length} ${brief.concerns.length === 1 ? "thing needs" : "things need"} your attention`
          : "nothing urgent on your desk",
        brief.positives.length ? `${brief.positives.length} going well` : null,
        brief.newSources.length ? `${brief.newSources.length} new ${brief.newSources.length === 1 ? "document" : "documents"} since the last pack` : null,
      ].filter(Boolean).join(" · ")
    : "Putting your brief together…";

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-8 lg:px-10 lg:py-10">
      {/* Greeting */}
      <section className="reveal">
        <p className="font-mono text-[11px] uppercase tracking-[.18em] text-[var(--muted)]">
          {now ? now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : "\u00a0"}
          {brief?.lastAnalysis && (
            <> · brief updated {new Date(brief.lastAnalysis.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>
          )}
        </p>
        <h1 className="mt-2 font-serif text-4xl tracking-[-.04em] sm:text-5xl">
          {now ? greeting(now) : "Hello"}{firstName ? `, ${firstName}` : ""}.
        </h1>
        <p className="mt-2 text-base text-[var(--muted)]">{summaryLine}</p>
      </section>

      {/* Stat row — full counts */}
      <section className="reveal reveal-delay mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Link href="/risks" className="stat-card stat-critical">
          <span className="stat-label">Open concerns</span>
          <span className="stat-value">{brief ? brief.concerns.length : "—"}</span>
          <span className="stat-note">see them all →</span>
        </Link>
        <Link href="/risks#going-well" className="stat-card stat-good">
          <span className="stat-label">Going well</span>
          <span className="stat-value">{brief ? brief.positives.length : "—"}</span>
          <span className="stat-note">what&apos;s working →</span>
        </Link>
        <Link href="/people" className="stat-card stat-people">
          <span className="stat-label">People</span>
          <span className="stat-value">{brief ? brief.stats.people : "—"}</span>
          <span className="stat-note">{departments.length} teams →</span>
        </Link>
        <Link href="/sources" className="stat-card stat-sources">
          <span className="stat-label">Documents</span>
          <span className="stat-value">{brief ? brief.stats.sources : "—"}</span>
          <span className="stat-note">{brief?.newSources.length ? `${brief.newSources.length} new` : "all read"} →</span>
        </Link>
      </section>

      {/* Ask */}
      <section className="reveal reveal-delay mt-8 ask-panel">
        <div className="flex items-center gap-2">
          <span className="ask-spark" aria-hidden="true">✦</span>
          <h2 className="text-sm font-semibold">Ask anything about Veloxa</h2>
        </div>
        {turns.length > 0 && (
          <div className="ask-thread thin-scrollbar">
            {turns.map((turn, index) => (
              <div key={index} className="space-y-2">
                <p className="chat-question">{turn.question}</p>
                {turn.answer !== null && (
                <div className="ask-answer">
                  <p className="text-[15px] leading-7">
                    {withCitations(turn.answer ?? "", (n) => setOpenCite(`${index}:${n}`))}
                  </p>
                  {turn.sources.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {turn.sources.map((source) => {
                        const key = `${index}:${source.n}`;
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setOpenCite(openCite === key ? null : key)}
                            className={`source-chip ${openCite === key ? "is-open" : ""}`}
                          >
                            <span className="cite-pill">{source.n}</span>
                            {source.source}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {turn.sources.map((source) =>
                    openCite === `${index}:${source.n}` ? (
                      <p key={source.n} className="mt-2 rounded-lg bg-[var(--surface)] p-3 text-sm leading-6 text-[var(--muted)]">
                        {source.summary}
                        <span className="mt-1 block font-mono text-[10px]">{source.source}{source.date ? ` · ${source.date}` : ""}</span>
                      </p>
                    ) : null,
                  )}
                </div>
                )}
              </div>
            ))}
            {asking && <p className="chat-thinking">Looking through everything…</p>}
            <div ref={threadEnd} />
          </div>
        )}
        <form onSubmit={(event) => ask(question, event)} className="mt-3 flex gap-2">
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ask about numbers, people, deadlines, anything…"
            className="chat-input"
          />
          <button disabled={asking || !question.trim()} className="chat-send">Ask</button>
        </form>
        {turns.length === 0 && suggestions.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <button key={suggestion} type="button" onClick={() => ask(suggestion)} className="suggestion-chip">
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Attention map — concerns only, top 3 */}
      <section className="reveal reveal-delay-2 mt-12">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="section-eyebrow text-[var(--critical)]">Needs your attention</p>
            <h2 className="font-serif text-2xl tracking-[-.03em]">What&apos;s going wrong</h2>
          </div>
          {brief && brief.concerns.length > 3 && (
            <Link href="/risks" className="text-xs font-semibold text-[var(--accent)] hover:underline">
              +{brief.concerns.length - 3} more →
            </Link>
          )}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {brief && top.length === 0 && (
            <p className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 text-sm text-[var(--muted)] lg:col-span-3">
              Nothing needs you right now. Run the health check below for a full picture.
            </p>
          )}
          {top.map((finding, index) => {
            const owner = finding.owner_employee_key ? personByKey.get(finding.owner_employee_key) : undefined;
            return (
              <article key={finding.id} className={`concern-card sev-${finding.severity}`}>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="concern-rank">{String(index + 1).padStart(2, "0")}</span>
                  <SeverityPill severity={finding.severity} />
                  {finding.area && <AreaPill area={finding.area} all={departments} />}
                  <ConfidencePill confidence={finding.confidence} />
                </div>
                <Link href={`/risks/${encodeURIComponent(finding.risk_key)}`} className="mt-3 block">
                  <h3 className="text-[17px] font-semibold leading-snug hover:underline">{finding.title}</h3>
                </Link>
                {finding.inference && <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{finding.inference}</p>}
                {finding.recommended_action && (
                  <p className="next-step mt-3"><span>Next</span>{finding.recommended_action}</p>
                )}
                <div className="mt-auto flex flex-wrap items-center gap-2 pt-4">
                  <Link href={`/risks/${encodeURIComponent(finding.risk_key)}`} className="ghost-button">
                    Evidence{finding.evidence_count ? ` · ${finding.evidence_count}` : ""}
                  </Link>
                  {owner && (
                    <Link href={chatLink(owner.empId, finding.title)} className="talk-button">
                      Talk to {owner.name.split(" ")[0]} →
                    </Link>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Going well */}
      {brief && brief.positives.length > 0 && (
        <section className="reveal reveal-delay-2 mt-12">
          <p className="section-eyebrow text-[var(--good)]">Going well</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {brief.positives.map((finding) => {
              const owner = finding.owner_employee_key ? personByKey.get(finding.owner_employee_key) : undefined;
              return (
                <article key={finding.id} className="positive-card">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="pill-good">✓ working</span>
                    {finding.area && <AreaPill area={finding.area} all={departments} />}
                  </div>
                  <Link href={`/risks/${encodeURIComponent(finding.risk_key)}`}>
                    <h3 className="mt-2 font-semibold hover:underline">{finding.title}</h3>
                  </Link>
                  {finding.inference && <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{finding.inference}</p>}
                  {owner && (
                    <Link href={chatLink(owner.empId, finding.title)} className="mt-2 inline-block text-xs font-semibold text-[var(--good)] hover:underline">
                      Thank {owner.name.split(" ")[0]} →
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* Health check */}
      <section className="reveal reveal-delay-2 mt-12 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-eyebrow text-[var(--accent)]">Company health check</p>
            <p className="text-sm text-[var(--muted)]">
              {health
                ? `Checked ${new Date(health.checkedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}${health.mode === "stored" ? " · from the last brief (live check unavailable)" : ""}`
                : "A team-by-team status, on demand."}
            </p>
          </div>
          <button onClick={runHealthCheck} disabled={checking} className="talk-button">
            {checking ? "Checking every team…" : health ? "Run again" : "Run health check"}
          </button>
        </div>
        {health && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {health.areas.map((area) => (
              <div key={area.area} className={`health-tile status-${area.status}`}>
                <button type="button" className="w-full text-left" onClick={() => setOpenArea(openArea === area.area ? null : area.area)}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <StatusDot status={area.status} />
                      {area.area}
                    </span>
                    <span className="status-label">{area.status === "act" ? "act now" : area.status}</span>
                  </span>
                  <span className="mt-1 block text-sm leading-6">{area.headline}</span>
                </button>
                {openArea === area.area && (
                  <div className="mt-2 border-t border-[var(--line)] pt-2 text-sm leading-6 text-[var(--muted)]">
                    <p>{area.why}</p>
                    {area.evidence.map((item) => (
                      <p key={item.summary} className="mt-2 text-xs">
                        “{item.summary}” <span className="font-mono text-[10px]">— {item.source}{item.tier === "secondary" ? " (call)" : ""}</span>
                      </p>
                    ))}
                    {area.findings.map((finding) => (
                      <Link key={finding.key} href={`/risks/${encodeURIComponent(finding.key)}`} className="mt-1 block text-xs font-semibold text-[var(--accent)] hover:underline">
                        {finding.polarity === "positive" ? "✓" : "!"} {finding.title}
                      </Link>
                    ))}
                  </div>
                )}
                {area.contact && (
                  <Link href={chatLink(area.contact.empId, `how ${area.area} is doing`)} className="mt-2 inline-block text-xs font-semibold text-[var(--accent)] hover:underline">
                    Check in with {area.contact.name.split(" ")[0]} →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* New today + teams */}
      <section className="reveal reveal-delay-2 mt-12 mb-8 grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
          <p className="section-eyebrow text-[var(--accent)]">New in the latest pack{brief?.latestDay ? ` · ${brief.latestDay}` : ""}</p>
          <ul className="mt-3 divide-y divide-[var(--line)]">
            {(brief?.newSources ?? []).slice(0, 6).map((source) => (
              <li key={source.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate">{source.title}</span>
                <span className="type-pill">{source.source_type}</span>
              </li>
            ))}
            {brief && brief.newSources.length === 0 && <li className="py-2 text-sm text-[var(--muted)]">Nothing new.</li>}
          </ul>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
          <p className="section-eyebrow text-[var(--accent)]">Your teams</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {departments.map((name) => (
              <Link
                key={name}
                href={`/people?department=${encodeURIComponent(name)}`}
                className="team-chip"
                style={{ borderColor: areaColor(name, departments) }}
              >
                <span className="team-dot" style={{ background: areaColor(name, departments) }} />
                {name}
                <span className="text-[var(--muted)]">{brief?.stats.departments[name]}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
