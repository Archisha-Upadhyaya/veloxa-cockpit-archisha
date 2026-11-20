"use client";

import type React from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import Link from "next/link";
import { useNow } from "@/components/useNow";
import PageLoader from "@/components/PageLoader";
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
type Source = { id: string; title: string; source_type: string; effectiveDate: string; dateIsFromDocument: boolean; available_at: string };
type Brief = {
  asOf: string;
  historical: boolean;
  ceo: { name: string; title: string } | null;
  stats: { people: number; sources: number; departments: Record<string, number> };
  concerns: Finding[];
  positives: Finding[];
  changes: { since: string; dated: Source[]; received: Source[]; people: string[] };
  lastAnalysis: { at: string; model: string | null } | null;
  briefStale?: boolean;
};

/** "18 Nov", with the year only when it differs from the year being viewed. */
const shortDate = (day: string, viewedYear?: string) =>
  new Date(`${day.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: !viewedYear || day.slice(0, 4) === viewedYear ? undefined : "numeric" });
type Person = { empId: string; name: string; title: string; department: string; isActive: boolean; level?: number; status?: string };
type AskSource = { n: number; id: string; summary: string; source: string; date: string | null };
/** answer is null while the reply is on its way. */
type AskTurn = { question: string; answer: string | null; sources: AskSource[]; mode?: string; confidence?: string; status?: string };
type HealthArea = {
  area: string;
  status: "good" | "watch" | "act" | "unknown";
  headline: string;
  why: string;
  evidence: Array<{ summary: string; source: string; tier: string }>;
  contact: { empId: string; name: string; title: string } | null;
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
      // The last saved health check, so it shows without re-running.
      fetch("/api/health-check").then((response) => response.json()).catch(() => ({ check: null })),
    ])
      .then(([briefData, peopleData, healthData]) => {
        setBrief(briefData);
        setPeople(peopleData.people ?? []);
        if (healthData.check) setHealth(healthData.check);
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
        confidence: body.confidence,
        status: body.status,
      });
    } catch {
      settle({ answer: "I couldn't reach the server. Try again in a moment.", sources: [] });
    } finally {
      setAsking(false);
    }
  }

  const [updating, setUpdating] = useState(false);
  async function updateBrief() {
    setUpdating(true);
    try {
      await fetch("/api/analyze", { method: "POST" });
      const response = await fetch("/api/dashboard");
      if (response.ok) setBrief(await response.json());
    } finally {
      setUpdating(false);
    }
  }

  async function runHealthCheck() {
    setChecking(true);
    try {
      const response = await fetch("/api/health-check", { method: "POST" });
      const body = await response.json();
      if (response.ok && body.check) setHealth(body.check);
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

  // Nothing renders until the brief, people and health check have all
  // arrived, so cards never appear empty and fill in later.
  if (!brief) {
    return (
      <main className="mx-auto w-full max-w-[1280px] px-5">
        <PageLoader
          fullScreen
          lines={["Reading the latest documents", "Ranking what needs you", "Checking who to talk to"]}
        />
      </main>
    );
  }

  const top = brief?.concerns.slice(0, 3) ?? [];
  const summaryLine = brief
    ? [
        brief.concerns.length
          ? `${brief.concerns.length} ${brief.concerns.length === 1 ? "thing needs" : "things need"} your attention`
          : brief.briefStale
            ? "Your brief hasn't been built from the latest documents yet"
            : "Nothing urgent on your desk",
        brief.positives.length ? `${brief.positives.length} going well` : null,
        brief.changes.received.length
          ? `${brief.changes.received.length} new ${brief.changes.received.length === 1 ? "document" : "documents"} since yesterday`
          : null,
      ].filter(Boolean).join(" · ")
    : "Putting your brief together…";

  return (
    <main className="mx-auto w-full max-w-[1280px] px-5 py-8 lg:px-10 lg:py-10">
      {/* Greeting */}
      <section className="reveal">
        <p className="font-mono text-[11px] uppercase tracking-[.18em] text-[var(--muted)]">
          {brief.historical
            ? `${new Date(`${brief.asOf}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · as known that day`
            : now ? now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }) : "\u00a0"}
          {brief?.lastAnalysis && !brief.historical && (
            <> · brief updated {new Date(brief.lastAnalysis.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</>
          )}
        </p>
        <h1 className="mt-1 font-serif text-3xl tracking-[-.03em] sm:text-4xl">
          {now ? greeting(now) : "Hello"}{firstName ? `, ${firstName}` : ""}.
        </h1>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-base text-[var(--muted)]">{summaryLine}</p>
          <Link href="/report" className="ghost-button inline-flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M14 3v4a1 1 0 0 0 1 1h4M17 21h-10a2 2 0 0 1 -2 -2v-14a2 2 0 0 1 2 -2h7l5 5v11a2 2 0 0 1 -2 2zM12 11v6M9 14l3 3l3 -3" />
            </svg>
            Brief as PDF
          </Link>
        </div>
      </section>

      {/* Stat row — full counts */}
      <section className="reveal reveal-delay mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Link href="/risks" className="stat-card stat-critical">
          <span className="stat-label">Open concerns</span>
          <span className="stat-value">{brief ? brief.concerns.length : "—"}</span>
          <span className="stat-note">see them all →</span>
        </Link>
        <a href="#health-check" className="stat-card stat-good">
          <span className="stat-label">Health check</span>
          {health ? (
            <>
              <span className="stat-value">
                {health.areas.filter((area) => area.status === "good").length}
                <span className="ml-1 text-sm font-sans text-[var(--muted)]">of {health.areas.length} areas going well</span>
              </span>
              <span className="stat-note">
                {health.areas.filter((area) => area.status === "act").length} need you · see all →
              </span>
            </>
          ) : (
            <>
              <span className="stat-value">—</span>
              <span className="stat-note">run a check →</span>
            </>
          )}
        </a>
        <Link href="/people" className="stat-card stat-people">
          <span className="stat-label">People</span>
          <span className="stat-value">{brief ? brief.stats.people : "—"}</span>
          <span className="stat-note">{departments.length} teams →</span>
        </Link>
        <Link href="/sources" className="stat-card stat-sources">
          <span className="stat-label">Documents</span>
          <span className="stat-value">{brief ? brief.stats.sources : "—"}</span>
          <span className="stat-note">{brief?.changes.received.length ? `${brief.changes.received.length} new since yesterday` : "nothing new since yesterday"} →</span>
        </Link>
      </section>

      {/* Attention map — concerns only, top 3 */}
      <section className="reveal reveal-delay mt-8">
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
          {brief && top.length === 0 && !brief.briefStale && (
            <p className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 text-sm text-[var(--muted)] lg:col-span-3">
              Nothing needs you right now. Run the health check below for a full picture.
            </p>
          )}
          {brief?.briefStale && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--warning)] bg-[var(--warn-soft)] p-5 lg:col-span-3">
              <p className="text-sm">
                {brief.changes.received.length
                  ? `${brief.changes.received.length} new ${brief.changes.received.length === 1 ? "document has" : "documents have"} arrived since this brief was built.`
                  : "This brief hasn't been built yet."}
                {top.length > 0 ? " The concerns below may be out of date." : ""}
              </p>
              <button type="button" onClick={updateBrief} disabled={updating} className="talk-button">
                {updating ? "Reading the new documents… (about a minute)" : "Update brief now"}
              </button>
            </div>
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
                {(finding.observed ?? finding.inference) && (
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{finding.observed ?? finding.inference}</p>
                )}
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

      {/* Ask */}
      <section className="reveal reveal-delay-2 mt-10 ask-panel">
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
                  {turn.status && (
                    <p className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span className={turn.status === "conflict" ? "sev-pill sev-pill-medium" : turn.status === "unknown" ? "type-pill" : turn.status === "refused" ? "sev-pill sev-pill-high" : "pill-good"}>
                        {{ answered: "answered", unknown: "I don't know", conflict: "sources disagree", refused: "won't answer" }[turn.status] ?? turn.status}
                      </span>
                      {turn.confidence && <ConfidencePill confidence={turn.confidence} />}
                    </p>
                  )}
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
      <section id="health-check" className="reveal reveal-delay-2 mt-12 scroll-mt-28 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="section-eyebrow text-[var(--accent)]">Company health check</p>
            <p className="text-sm text-[var(--muted)]">
              {health
                ? `Last checked ${new Date(health.checkedAt).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}${health.mode === "stored" ? " · based on your brief (the live check was unavailable)" : ""}`
                : "How each part of the business is doing: clients, money, delivery, people. Run it when you want the full picture."}
            </p>
          </div>
          <button onClick={runHealthCheck} disabled={checking} className={`talk-button ${brief.historical ? "hidden" : ""}`}>
            {checking ? "Checking… (up to a minute)" : health ? "Check again" : "Run health check"}
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
                    <span className="status-label">
                      {{ act: "needs you", watch: "keep an eye", good: "going well", unknown: "no data" }[area.status]}
                    </span>
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
                  </div>
                )}
                {area.contact && (
                  <Link href={chatLink(area.contact.empId, `how ${area.area} is doing`)} className="mt-2 inline-block text-xs font-semibold text-[var(--accent)] hover:underline">
                    Talk to {area.contact.name.split(" ")[0]} →
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* What changed + teams: two equal columns */}
      <section className="reveal reveal-delay-2 mt-12 mb-8 grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
          <p className="section-eyebrow text-[var(--brand-2)]">What changed since yesterday</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {shortDate(brief.changes.since, brief.asOf.slice(0, 4))} – {shortDate(brief.asOf, brief.asOf.slice(0, 4))} · dates are those written in each document
          </p>
          {brief.changes.people.length > 0 && (
            <ul className="mt-4 space-y-1.5">
              {brief.changes.people.map((change) => (
                <li key={change} className="change-person">{change}</li>
              ))}
            </ul>
          )}
          <ul className="mt-4 divide-y divide-[var(--line)]">
            {[...brief.changes.dated, ...brief.changes.received.filter((doc) => !brief.changes.dated.some((dated) => dated.id === doc.id))]
              .slice(0, 5)
              .map((source) => (
                <li key={source.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate">{source.title}</span>
                  <span className="type-pill shrink-0">
                    {source.dateIsFromDocument ? `dated ${shortDate(source.effectiveDate, brief.asOf.slice(0, 4))}` : "new · undated"}
                  </span>
                </li>
              ))}
            {brief.changes.received.length === 0 && brief.changes.dated.length === 0 && (
              <li className="py-2 text-sm text-[var(--muted)]">No new documents since yesterday.</li>
            )}
          </ul>
          {brief.changes.received.length > 5 && (
            <Link href="/sources" className="mt-auto pt-3 text-xs font-semibold text-[var(--accent)] hover:underline">
              +{brief.changes.received.length - 5} more in Documents →
            </Link>
          )}
        </div>

        <div className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6">
          <p className="section-eyebrow text-[var(--accent)]">Your teams</p>
          <p className="mt-1 text-xs text-[var(--muted)]">Headcount, open concerns and who leads each team.</p>
          <div className="mt-4 grid flex-1 gap-2 sm:grid-cols-2">
            {departments.map((name) => {
              const open = brief.concerns.filter((concern) => concern.area === name).length;
              const members = people.filter((person) => person.department === name && person.isActive);
              const lead = [...members].sort((left, right) => (left.level ?? 9) - (right.level ?? 9))[0];
              const away = members.filter((person) => person.status && person.status !== "Active").length;
              return (
                <Link key={name} href={`/people?department=${encodeURIComponent(name)}`} className="team-card" style={{ "--area": areaColor(name, departments) } as React.CSSProperties}>
                  <span className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold"><span className="team-dot" style={{ background: areaColor(name, departments) }} />{name}</span>
                    <span className="font-serif text-xl">{brief.stats.departments[name]}</span>
                  </span>
                  <span className="mt-1 block truncate text-xs text-[var(--muted)]">{lead ? `Led by ${lead.name}` : " "}</span>
                  <span className="mt-2 flex flex-wrap gap-1">
                    <span className={open ? "sev-pill sev-pill-high" : "pill-good"}>{open ? `${open} open ${open === 1 ? "concern" : "concerns"}` : "no open concerns"}</span>
                    {away > 0 && <span className="sev-pill sev-pill-medium">{away} away / leaving</span>}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
    </main>
  );
}
