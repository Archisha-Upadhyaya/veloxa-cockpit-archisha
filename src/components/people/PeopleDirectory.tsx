"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

type Person = {
  empId: string;
  name: string;
  title: string;
  department: string;
  email: string | null;
  joined: string | null;
  tenure: string | null;
  location: string | null;
  status: string;
  exitDate: string | null;
  isActive: boolean;
  managerId: string | null;
  managerName: string | null;
  managerTitle: string | null;
  reports: Array<{ empId: string; name: string; title: string }>;
  level: number;
  tier?: number;
  chain: string[];
  source: string | null;
  mentions: Array<{ summary: string; source: string; date: string | null }>;
  mentionCount: number;
};

/** answer is null while the reply is on its way. */
type Message = { question: string; answer: string | null; provenance: string };
type SortMode = "hierarchy" | "name";

function initials(name: string) {
  return name.split(" ").map((part) => part[0]).slice(0, 2).join("");
}

const PALETTE = ["var(--accent)", "#82684d", "#687c69", "#9a7958", "#5f6f86", "#8a5d6b", "#6b7a4f"];
function departmentColor(department: string, all: string[]) {
  const index = all.indexOf(department);
  return PALETTE[(index < 0 ? 0 : index) % PALETTE.length];
}

function provenanceLabel(provenance: string) {
  if (provenance === "grounded" || provenance === "grounded_inference") return "from what they know";
  if (provenance === "profile_inference") return "from their role";
  if (provenance === "recorded_context") return "from a previous conversation";
  if (provenance === "policy_refusal") return "confidential";
  if (provenance === "conversation") return "in conversation";
  if (provenance === "no_visibility") return "not known";
  if (provenance === "no_record") return "no record";
  return "not certain";
}

function statusTone(person: Person) {
  if (!person.isActive) return "bg-[var(--surface-2)] text-[var(--muted)]";
  if (person.status !== "Active") return "bg-amber-100 text-amber-900";
  return "bg-[var(--accent-soft)] text-[var(--accent)]";
}

export default function PeopleDirectory({
  initialDepartment = "All",
  initialChat,
  initialTopic,
}: {
  initialDepartment?: string;
  /** Opened from a concern or health tile: start a chat with this person. */
  initialChat?: string;
  initialTopic?: string;
}) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Deep links from the overview (?department=…) open a single department.
  const [department, setDepartment] = useState(initialDepartment);
  const [sortMode, setSortMode] = useState<SortMode>("hierarchy");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string>();
  const [chatId, setChatId] = useState<string | undefined>(initialChat);
  const [question, setQuestion] = useState(
    initialTopic ? `I wanted to talk to you about ${initialTopic.charAt(0).toLowerCase()}${initialTopic.slice(1)}.` : "",
  );
  const [conversation, setConversation] = useState<Message[]>([]);
  const [asking, setAsking] = useState(false);
  const threadEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/people")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load people.");
        setPeople(result.people ?? []);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unable to load people."),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation, asking]);

  function chooseDepartment(value: string) {
    setDepartment(value);
    const url = new URL(window.location.href);
    if (value === "All") url.searchParams.delete("department");
    else url.searchParams.set("department", value);
    window.history.replaceState(null, "", url);
  }

  const departments = useMemo(
    () => Array.from(new Set(people.map((person) => person.department))).sort(),
    [people],
  );
  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const person of people) result[person.department] = (result[person.department] ?? 0) + 1;
    return result;
  }, [people]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = people.filter(
      (person) =>
        (department === "All" || person.department === department) &&
        (!needle ||
          [person.name, person.title, person.managerName ?? "", person.location ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(needle)),
    );
    if (sortMode === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    return filtered; // the API already returns reporting-line order
  }, [people, department, search, sortMode]);
  // Indent relative to the most senior person in view, so a filtered
  // department starts at the left edge.
  const baseLevel = visible.length ? Math.min(...visible.map((person) => person.level)) : 0;

  const chatPerson = people.find((person) => person.empId === chatId);
  const activeCount = people.filter((person) => person.isActive).length;
  const onNotice = people.filter((person) => person.isActive && person.status !== "Active").length;

  function openChat(person: Person) {
    setChatId(person.empId);
    setConversation([]);
    setQuestion("");
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!chatPerson || !question.trim() || asking) return;
    const currentQuestion = question.trim();
    setQuestion("");
    setAsking(true);
    // Show the CEO's message immediately; the reply fills in when it arrives.
    const history = conversation
      .filter((entry) => entry.answer !== null)
      .slice(-6)
      .map((entry) => ({ question: entry.question, answer: entry.answer as string }));
    setConversation((current) => [...current, { question: currentQuestion, answer: null, provenance: "pending" }]);
    const settle = (answer: string, provenance: string) =>
      setConversation((current) =>
        current.map((entry, index) =>
          index === current.length - 1 && entry.answer === null ? { ...entry, answer, provenance } : entry,
        ),
      );
    try {
      const response = await fetch(`/api/people/${chatPerson.empId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: currentQuestion,
          history,
        }),
      });
      const result = await response.json();
      settle(
        result.response?.answer ??
          (result.response?.provenance === "no_record"
            ? `Nothing on record answers that for ${chatPerson.name}.`
            : result.error ?? "No response came back. Try asking again."),
        result.response?.provenance ?? "no_visibility",
      );
    } catch (reason) {
      console.error("Employee chat request failed", reason);
      settle("I couldn't reach the server. Try again in a moment.", "no_visibility");
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      <header className="people-header">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[.2em] text-[var(--accent)]">People</p>
          <h1 className="mt-1 font-serif text-4xl tracking-[-.04em]">Who&apos;s who, and who they report to</h1>
        </div>
        <dl className="people-stats">
          <div><dt>People</dt><dd>{loading ? "—" : people.length}</dd></div>
          <div><dt>Active</dt><dd>{loading ? "—" : activeCount}</dd></div>
          <div><dt>On notice</dt><dd>{loading ? "—" : onNotice}</dd></div>
          <div><dt>Teams</dt><dd>{loading ? "—" : departments.length}</dd></div>
        </dl>
      </header>

      <div className="people-toolbar">
        <div className="thin-scrollbar flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
          {["All", ...departments].map((item) => (
            <button
              key={item}
              onClick={() => chooseDepartment(item)}
              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition ${
                department === item
                  ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                  : "border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] hover:border-[var(--accent)]"
              }`}
            >
              {item}
              <span className="ml-1.5 opacity-60">{item === "All" ? people.length : counts[item] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Find a person, role, manager…"
            className="w-56 rounded-lg border border-[var(--line)] bg-[var(--paper)] px-3 py-1.5 text-xs outline-none focus:border-[var(--accent)]"
          />
          <div className="flex rounded-lg border border-[var(--line)] bg-[var(--paper)] p-0.5 text-xs">
            {(["hierarchy", "name"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setSortMode(mode)}
                className={`rounded-md px-2.5 py-1 ${sortMode === mode ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--muted)]"}`}
              >
                {mode === "hierarchy" ? "Reporting line" : "A–Z"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <section className="people-table">
        <div className="people-row people-row-head" aria-hidden="true">
          <span>Person</span>
          <span>Reports to</span>
          <span>Team</span>
          <span>Joined</span>
          <span>Location</span>
          <span>Status</span>
          <span>In records</span>
          <span />
        </div>
        {loading && <p className="people-empty">Loading people…</p>}
        {error && <p className="people-empty">{error}</p>}
        {!loading && !error && visible.length === 0 && (
          <p className="people-empty">No one matches this view.</p>
        )}
        {visible.map((person) => {
          const expanded = expandedId === person.empId;
          const indent = sortMode === "hierarchy" ? person.level - baseLevel : 0;
          return (
            <Fragment key={person.empId}>
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={() => setExpandedId(expanded ? undefined : person.empId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setExpandedId(expanded ? undefined : person.empId);
                  }
                }}
                className={`people-row ${expanded ? "is-expanded" : ""} ${person.isActive ? "" : "is-inactive"}`}
              >
                <span className="flex min-w-0 items-center gap-3" style={{ paddingLeft: `${indent * 1.25}rem` }}>
                  {indent > 0 && <span className="people-branch" aria-hidden="true">└</span>}
                  <span
                    className="person-avatar"
                    style={{ backgroundColor: departmentColor(person.department, departments) }}
                  >
                    {initials(person.name)}
                  </span>
                  <span className="min-w-0">
                    <span className="person-name">{person.name}</span>
                    <span className="person-title">{person.title} · {person.department}</span>
                  </span>
                </span>
                <span className="people-cell">
                  {person.managerName ? (
                    <>
                      <span className="block truncate text-[var(--ink)]">{person.managerName}</span>
                      <span className="block truncate text-[11px] text-[var(--muted)]">{person.managerTitle}</span>
                    </>
                  ) : (
                    <span className="text-[var(--muted)]">Top of company</span>
                  )}
                </span>
                <span className="people-cell">
                  {person.reports.length ? `${person.reports.length} direct` : "—"}
                </span>
                <span className="people-cell">
                  <span className="block">{person.joined ?? "—"}</span>
                  {person.tenure && <span className="block text-[11px] text-[var(--muted)]">{person.tenure}</span>}
                </span>
                <span className="people-cell truncate">{person.location ?? "—"}</span>
                <span className="people-cell">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.08em] ${statusTone(person)}`}>
                    {person.status}
                  </span>
                  {person.exitDate && (
                    <span className="mt-1 block text-[11px] text-[var(--muted)]">exit {person.exitDate}</span>
                  )}
                </span>
                <span className="people-cell">
                  {person.mentionCount ? `${person.mentionCount} ${person.mentionCount === 1 ? "mention" : "mentions"}` : "—"}
                </span>
                <span className="flex justify-end">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      openChat(person);
                    }}
                    disabled={!person.isActive || (person.tier === 0 && person.reports.length > 0)}
                    title={
                      person.tier === 0 && person.reports.length > 0
                        ? "That's you"
                        : person.isActive
                          ? `Chat with ${person.name}`
                          : "No longer with the company"
                    }
                    className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Chat
                  </button>
                </span>
              </div>
              {expanded && (
                <div className="people-detail">
                  <div>
                    <p className="people-detail-label">Reporting line</p>
                    <p className="mt-1 text-sm text-[var(--ink)]">
                      {[...person.chain, person.name].join(" → ")}
                    </p>
                    <p className="people-detail-label mt-4">Direct reports</p>
                    {person.reports.length ? (
                      <ul className="mt-1 space-y-0.5 text-sm">
                        {person.reports.map((report) => (
                          <li key={report.empId}>
                            {report.name} <span className="text-[var(--muted)]">· {report.title}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-[var(--muted)]">None</p>
                    )}
                  </div>
                  <div>
                    <p className="people-detail-label">Contact &amp; record</p>
                    <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      <dt className="text-[var(--muted)]">ID</dt><dd>{person.empId}</dd>
                      <dt className="text-[var(--muted)]">Email</dt>
                      <dd className="truncate">{person.email ? <a className="hover:underline" href={`mailto:${person.email}`}>{person.email}</a> : "—"}</dd>
                      <dt className="text-[var(--muted)]">Source</dt><dd className="truncate">{person.source ?? "—"}</dd>
                    </dl>
                  </div>
                  <div>
                    <p className="people-detail-label">Where they appear in the records</p>
                    {person.mentions.length ? (
                      <ul className="mt-1 space-y-2">
                        {person.mentions.map((mention) => (
                          <li key={mention.summary} className="text-sm leading-6">
                            {mention.summary}
                            <span className="block font-mono text-[10px] text-[var(--muted)]">
                              {mention.source}{mention.date ? ` · ${mention.date}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-sm text-[var(--muted)]">Not named in any released document yet.</p>
                    )}
                  </div>
                </div>
              )}
            </Fragment>
          );
        })}
      </section>

      {chatPerson && (
        <div className="chat-backdrop" role="presentation" onMouseDown={() => setChatId(undefined)}>
          <section
            className="chat-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`Chat with ${chatPerson.name}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="chat-header">
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="person-avatar"
                  style={{ backgroundColor: departmentColor(chatPerson.department, departments) }}
                >
                  {initials(chatPerson.name)}
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold">{chatPerson.name}</h2>
                  <p className="truncate text-xs text-[var(--muted)]">
                    {chatPerson.title}
                    {chatPerson.managerName ? ` · reports to ${chatPerson.managerName}` : ""}
                  </p>
                </div>
              </div>
              <button onClick={() => setChatId(undefined)} className="close-button" aria-label="Close chat">×</button>
            </header>

            <div className="chat-thread thin-scrollbar">
              {conversation.length === 0 && !asking && (
                <p className="chat-hint">
                  Ask {chatPerson.name.split(" ")[0]} anything. Answers come only from released records; if nothing covers it, they&apos;ll say so.
                </p>
              )}
              {conversation.map((entry, index) => (
                <div key={`${entry.question}-${index}`} className="space-y-2">
                  <p className="chat-question">{entry.question}</p>
                  {entry.answer !== null && (
                    <div className="chat-answer">
                      <p className="text-sm leading-6 text-[var(--ink)]">{entry.answer}</p>
                      <span className="chat-provenance">{provenanceLabel(entry.provenance)}</span>
                    </div>
                  )}
                </div>
              ))}
              {asking && <p className="chat-thinking">{chatPerson.name.split(" ")[0]} is typing…</p>}
              <div ref={threadEnd} />
            </div>

            <form onSubmit={ask} className="chat-composer">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={`Message ${chatPerson.name.split(" ")[0]}…`}
                className="chat-input"
                autoFocus
              />
              <button disabled={asking || !question.trim()} className="chat-send">Send</button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
