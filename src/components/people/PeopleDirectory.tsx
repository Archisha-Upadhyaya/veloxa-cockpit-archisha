"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import PageLoader from "@/components/PageLoader";

type Reported = { status: string; reportedOn: string; expectedExit?: string | null; note?: string | null; source: string };
type RetentionFlag = { empId: string; name: string; level: "check_in" | "urgent"; reasons: Array<{ text: string; source: string }>; suggestion: string };
type RetentionCheck = { checkedAt: string; people: RetentionFlag[] };
type ImpactAnswer = { answer: string; sources: Array<{ n: number; source: string }> };

type Person = {
  reported?: Reported | null;
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
  pendingChanges?: Array<{ to: string; when: string; status: string; reason: string | null }>;
  isPersona?: boolean;
  presence?: { documents: number; mentions: number };
};

type OrgChange = {
  id: string;
  scope_type: "employee" | "department";
  scope_key: string;
  new_manager_key: string | null;
  new_manager_title: string | null;
  effective_from: string | null;
  effective_note: string | null;
  status: "tentative" | "confirmed" | "cancelled";
  source: string | null;
  applied: boolean;
  reason: string | null;
  affects: string[];
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
  if (provenance === "grounded" || provenance === "grounded_inference") return "based on company records";
  if (provenance === "profile_inference") return "based on their role";
  if (provenance === "recorded_context") return "from an earlier conversation";
  if (provenance === "policy_refusal") return "confidential";
  if (provenance === "conversation") return "in conversation";
  if (provenance === "no_visibility") return "outside their knowledge";
  if (provenance === "no_record") return "no record";
  return "unverified";
}

function statusTone(person: Person) {
  if (!person.isActive) return "bg-[var(--surface-2)] text-[var(--muted)]";
  if (person.status !== "Active") return "bg-amber-100 text-amber-900";
  return "bg-[var(--accent-soft)] text-[var(--accent)]";
}

export default function PeopleDirectory() {
  // Deep links: ?department=Finance, or ?chat=VX003&about=<topic> from a concern.
  const searchParams = useSearchParams();
  const initialDepartment = searchParams.get("department") ?? "All";
  const initialChat = searchParams.get("chat") ?? undefined;
  const initialTopic = searchParams.get("about") ?? undefined;
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
  const [changes, setChanges] = useState<OrgChange[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [editingChange, setEditingChange] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ manager: string; date: string }>({ manager: "", date: "" });
  const [savingChange, setSavingChange] = useState(false);
  const [retention, setRetention] = useState<RetentionCheck | null>(null);
  const [retentionRunning, setRetentionRunning] = useState(false);
  const [retentionLoaded, setRetentionLoaded] = useState(false);
  const [retentionError, setRetentionError] = useState<string | null>(null);
  const flagFor = (empId: string) => retention?.people.find((flag) => flag.empId === empId);
  const [reportDraft, setReportDraft] = useState<{ empId: string; exit: string; note: string } | null>(null);
  const [impact, setImpact] = useState<Record<string, ImpactAnswer | "loading">>({});

  async function saveReport(empId: string, body: Record<string, unknown> | null) {
    await fetch(`/api/people/${empId}/report`, {
      method: body ? "POST" : "DELETE",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    setReportDraft(null);
    await reloadDirectory();
  }

  async function explainDeparture(person: Person) {
    setImpact((current) => ({ ...current, [person.empId]: "loading" }));
    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          question: `${person.name} (${person.title}) ${person.reported ? "has resigned" : "might leave"}${person.exitDate ? `, last day around ${person.exitDate}` : ""}. What does this do to the work they own: which projects, deadlines and open tasks depend on them, who could take it over, and what should I tell the board?`,
        }),
      });
      const body = await response.json();
      setImpact((current) => ({ ...current, [person.empId]: { answer: body.answer ?? body.error ?? "No answer came back.", sources: body.sources ?? [] } }));
    } catch {
      setImpact((current) => ({ ...current, [person.empId]: { answer: "I couldn't reach the server. Try again.", sources: [] } }));
    }
  }

  async function reloadDirectory() {
    const response = await fetch("/api/people");
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Unable to load people.");
    setPeople(result.people ?? []);
    setChanges(result.changes ?? []);
    setWarnings(result.warnings ?? []);
  }

  async function updateChange(id: string, update: Record<string, unknown>) {
    setSavingChange(true);
    try {
      const response = await fetch(`/api/org-changes/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(update),
      });
      if (response.ok) {
        setEditingChange(null);
        await reloadDirectory();
      }
    } finally {
      setSavingChange(false);
    }
  }

  useEffect(() => {
    fetch("/api/people")
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to load people.");
        setPeople(result.people ?? []);
        setChanges(result.changes ?? []);
        setWarnings(result.warnings ?? []);
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "Unable to load people."),
      )
      .finally(() => setLoading(false));
    // Last saved retention check, shown without re-running it.
    fetch("/api/retention-check")
      .then((response) => response.json())
      .then((result) => setRetention(result.check ?? null))
      .catch(() => undefined)
      .finally(() => setRetentionLoaded(true));
  }, []);

  async function runRetentionCheck() {
    setRetentionRunning(true);
    setRetentionError(null);
    try {
      const response = await fetch("/api/retention-check", { method: "POST" });
      const result = await response.json();
      if (response.ok && result.check) setRetention(result.check);
      else setRetentionError(result.error ?? "The retention check couldn't run.");
    } finally {
      setRetentionRunning(false);
    }
  }

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

  // Teams only: a "department" made up of just the CEO (Leadership) is not a team.
  const departments = useMemo(
    () =>
      Array.from(new Set(people.map((person) => person.department)))
        .filter((department) => people.some((person) => person.department === department && person.level > 0))
        .sort(),
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

  // The page appears only once people and the retention check are both in.
  if (loading || !retentionLoaded) {
    return <PageLoader lines={["Loading the team", "Tracing who reports to whom", "Checking who needs a check-in"]} />;
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
          <div><dt>Chat personas</dt><dd>{loading ? "—" : people.filter((person) => person.isPersona).length}</dd></div>
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

      <section className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-5 py-4">
        <div className="min-w-0">
          <p className="section-eyebrow text-[var(--warning)]">Retention watch</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {retention
              ? retention.people.length
                ? `${retention.people.length} ${retention.people.length === 1 ? "person" : "people"} you may want to check in with (${retention.people.filter((flag) => flag.level === "urgent").length} urgent) · checked ${new Date(retention.checkedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}. Open a row for the reasons.`
                : `No one stood out when last checked (${new Date(retention.checkedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}).`
              : "Who you may want to check in with about workload or retention, and why. Uses work records only: no messages, no scores."}
          </p>
          {retentionError && <p className="mt-1 text-xs text-[var(--critical)]">{retentionError}</p>}
        </div>
        <button type="button" className="talk-button" onClick={runRetentionCheck} disabled={retentionRunning}>
          {retentionRunning ? "Checking… (up to a minute)" : retention ? "Check again" : "Run retention check"}
        </button>
      </section>

      {(changes.length > 0 || warnings.length > 0) && (
        <section className="mb-4 rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-5">
          <p className="section-eyebrow text-[var(--accent)]">Reporting-line changes</p>
          <div className="mt-3 flex flex-col gap-3">
            {changes.map((change) => (
              <div key={change.id} className="rounded-xl bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {change.scope_type === "department" ? `${change.scope_key} team` : change.affects.join(", ")}
                      {" → "}
                      {people.find((person) => person.empId === change.new_manager_key)?.name ?? change.new_manager_title ?? "new manager"}
                    </p>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      {change.effective_from ?? change.effective_note ?? "Date not set"}
                      {change.affects.length > 0 && change.scope_type === "department" ? ` · moves ${change.affects.join(", ")} and their team` : ""}
                      {change.source ? ` · from ${change.source}` : ""}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <span className={change.applied ? "pill-good" : change.status === "confirmed" ? "sev-pill sev-pill-medium" : "type-pill"}>
                      {change.applied ? "in effect" : change.status}
                    </span>
                    {!change.applied && (
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => {
                          setEditingChange(editingChange === change.id ? null : change.id);
                          setDraft({ manager: change.new_manager_key ?? "", date: change.effective_from ?? "" });
                        }}
                      >
                        Update
                      </button>
                    )}
                  </span>
                </div>
                {!change.applied && change.reason && <p className="mt-2 text-xs text-[var(--warning)]">Not applied: {change.reason}</p>}
                {editingChange === change.id && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-3">
                    <label className="text-xs text-[var(--muted)]">
                      New manager
                      <select
                        value={draft.manager}
                        onChange={(event) => setDraft({ ...draft, manager: event.target.value })}
                        className="mt-1 block rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]"
                      >
                        <option value="">{change.new_manager_title ?? "Not appointed yet"}</option>
                        {people.filter((person) => person.isActive).map((person) => (
                          <option key={person.empId} value={person.empId}>{person.name} · {person.title}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-[var(--muted)]">
                      Effective from
                      <input
                        type="date"
                        value={draft.date}
                        onChange={(event) => setDraft({ ...draft, date: event.target.value })}
                        className="mt-1 block rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={savingChange}
                      className="talk-button"
                      onClick={() => updateChange(change.id, {
                        new_manager_key: draft.manager || null,
                        effective_from: draft.date || null,
                        status: draft.manager && draft.date ? "confirmed" : "tentative",
                      })}
                    >
                      {draft.manager && draft.date ? "Confirm change" : "Save as tentative"}
                    </button>
                    <button type="button" disabled={savingChange} className="ghost-button" onClick={() => updateChange(change.id, { status: "cancelled" })}>
                      Cancel change
                    </button>
                  </div>
                )}
              </div>
            ))}
            {warnings.map((warning) => (
              <p key={warning} className="text-xs text-[var(--warning)]">⚠ {warning}</p>
            ))}
          </div>
        </section>
      )}

      <section className="people-table">
        <div className="people-row people-row-head" aria-hidden="true">
          <span>Person</span>
          <span>Reports to</span>
          <span>Team</span>
          <span>Joined</span>
          <span>Location</span>
          <span>Status</span>
          <span>Mentioned in</span>
          <span />
        </div>
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
                    <span className="person-name">
                      {person.name}
                      {flagFor(person.empId) && (
                        <span
                          className={`ml-2 rounded-full px-1.5 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-[.08em] ${flagFor(person.empId)!.level === "urgent" ? "bg-[var(--crit-soft)] text-[var(--critical)]" : "bg-[var(--warn-soft)] text-[var(--warning)]"}`}
                          title={flagFor(person.empId)!.reasons.map((reason) => reason.text).join("; ")}
                        >
                          {flagFor(person.empId)!.level === "urgent" ? "urgent" : "check in"}
                        </span>
                      )}
                      {(person.pendingChanges?.length ?? 0) > 0 && (
                        <span className="ml-2 rounded-full bg-[var(--warn-soft)] px-1.5 py-0.5 align-middle text-[9px] font-semibold uppercase tracking-[.08em] text-[var(--warning)]" title={person.pendingChanges!.map((change) => `→ ${change.to} (${change.when})`).join("; ")}>
                          moving
                        </span>
                      )}
                    </span>
                    <span className="person-title">
                      {person.title}
                      {person.title.toLowerCase().includes(person.department.toLowerCase()) ? "" : ` · ${person.department}`}
                    </span>
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
                  {person.presence?.documents ? `${person.presence.documents} ${person.presence.documents === 1 ? "document" : "documents"}` : "—"}
                </span>
                <span className="flex justify-end">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      openChat(person);
                    }}
                    disabled={!person.isPersona}
                    title={
                      person.tier === 0 && person.reports.length > 0
                        ? "That's you"
                        : !person.isActive
                          ? "No longer with the company"
                          : person.isPersona
                            ? `Chat with ${person.name}`
                            : `Not a chat persona: appears in ${person.presence?.documents ?? 0} ${person.presence?.documents === 1 ? "document" : "documents"}`
                    }
                    className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] transition hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Chat
                  </button>
                </span>
              </div>
              {expanded && (
                <div className="people-detail">
                  {flagFor(person.empId) && (
                    <div className="col-span-full rounded-xl border border-[var(--warning)] bg-[var(--warn-soft)] p-4">
                      <p className="people-detail-label text-[var(--warning)]">Why you might check in</p>
                      <ul className="mt-2 space-y-1 text-sm">
                        {flagFor(person.empId)!.reasons.map((reason) => (
                          <li key={reason.text}>
                            {reason.text} <span className="font-mono text-[10px] text-[var(--muted)]">— {reason.source}</span>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-sm"><strong>Suggestion:</strong> {flagFor(person.empId)!.suggestion}</p>
                    </div>
                  )}
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
                      <p className="mt-1 text-sm text-[var(--muted)]">Not mentioned in any document yet.</p>
                    )}
                  </div>
                  {person.level > 0 && person.isActive && (
                    <div className="col-span-full border-t border-[var(--line)] pt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        {person.reported ? (
                          <>
                            <span className="sev-pill sev-pill-medium">
                              {person.status}{person.exitDate ? ` · last day ~${person.exitDate}` : ""}
                            </span>
                            <span className="text-xs text-[var(--muted)]">
                              You reported this on {person.reported.reportedOn}; not in the HR records yet.
                            </span>
                            <button type="button" className="ghost-button" onClick={() => saveReport(person.empId, null)}>
                              Clear
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => setReportDraft({ empId: person.empId, exit: "", note: "" })}
                          >
                            Record a resignation
                          </button>
                        )}
                        <button
                          type="button"
                          className="talk-button"
                          disabled={impact[person.empId] === "loading"}
                          onClick={() => explainDeparture(person)}
                        >
                          {impact[person.empId] === "loading" ? "Working it out…" : `What does ${person.name.split(" ")[0]} leaving mean?`}
                        </button>
                      </div>
                      {reportDraft?.empId === person.empId && (
                        <div className="mt-3 flex flex-wrap items-end gap-2">
                          <label className="text-xs text-[var(--muted)]">
                            Expected last day
                            <input
                              type="date"
                              value={reportDraft.exit}
                              onChange={(event) => setReportDraft({ ...reportDraft, exit: event.target.value })}
                              className="mt-1 block rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]"
                            />
                          </label>
                          <label className="min-w-[16rem] flex-1 text-xs text-[var(--muted)]">
                            Note (optional)
                            <input
                              value={reportDraft.note}
                              onChange={(event) => setReportDraft({ ...reportDraft, note: event.target.value })}
                              placeholder="e.g. told me this morning, two months' notice"
                              className="mt-1 block w-full rounded-lg border border-[var(--line)] bg-[var(--paper)] px-2 py-1.5 text-sm text-[var(--ink)]"
                            />
                          </label>
                          <button
                            type="button"
                            className="talk-button"
                            onClick={() =>
                              saveReport(person.empId, {
                                status: "resigned",
                                expectedExit: reportDraft.exit || null,
                                note: reportDraft.note || null,
                              })
                            }
                          >
                            Save
                          </button>
                          <button type="button" className="ghost-button" onClick={() => setReportDraft(null)}>
                            Cancel
                          </button>
                        </div>
                      )}
                      {impact[person.empId] && impact[person.empId] !== "loading" && (
                        <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--paper)] p-4 text-sm leading-7">
                          {(impact[person.empId] as ImpactAnswer).answer}
                          {(impact[person.empId] as ImpactAnswer).sources.length > 0 && (
                            <p className="mt-2 font-mono text-[10px] text-[var(--muted)]">
                              Sources: {(impact[person.empId] as ImpactAnswer).sources.map((source) => `[${source.n}] ${source.source}`).join(" · ")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
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
                  Ask {chatPerson.name.split(" ")[0]} anything. They only know what&apos;s in the company&apos;s documents, and will tell you if something isn&apos;t covered.
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
