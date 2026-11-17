"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

type Person = {
  empId: string;
  name: string;
  title: string;
  department: string;
  joined?: string;
  location?: string;
  groundedFacts?: string[];
  assumedDetails?: string[];
  interview?: Array<{
    question: string;
    answer: string;
    provenance: string;
    refs: string[];
  }>;
};

type Message = {
  question: string;
  answer: string;
  provenance: string;
};

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function departmentColor(department: string) {
  if (department === "Engineering") return "var(--accent)";
  if (department === "Finance") return "#82684d";
  if (department === "People & Ops") return "#687c69";
  return "#9a7958";
}

export default function PeopleDirectory() {
  const [people, setPeople] = useState<Person[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [department, setDepartment] = useState("All");
  const [question, setQuestion] = useState("");
  const [conversation, setConversation] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    fetch("/api/people")
      .then((response) => response.json())
      .then((result: { people?: Person[] }) => {
        const loaded = result.people ?? [];
        setPeople(loaded);
      })
      .catch((error) => console.error("People request failed", error))
      .finally(() => setLoading(false));
  }, []);

  const departments = useMemo(
    () => [
      "All",
      ...Array.from(
        new Set(people.map((person) => person.department).filter(Boolean)),
      ),
    ],
    [people],
  );
  const filtered =
    department === "All"
      ? people
      : people.filter((person) => person.department === department);
  const selected = people.find((person) => person.empId === selectedId);

  function openPerson(person: Person) {
    setSelectedId(person.empId);
    setConversation([]);
    setQuestion("");
  }

  function closePerson() {
    setSelectedId(undefined);
    setConversation([]);
    setQuestion("");
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (!selected || !question.trim() || asking) return;
    const currentQuestion = question.trim();
    setQuestion("");
    setAsking(true);
    try {
      const response = await fetch(`/api/people/${selected.empId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: currentQuestion }),
      });
      const result = await response.json();
      setConversation((current) => [
        ...current,
        {
          question: currentQuestion,
          answer:
            result.response?.answer ??
            "No response was returned from the connected records.",
          provenance: result.response?.provenance ?? "no_visibility",
        },
      ]);
    } catch (error) {
      console.error("Employee context request failed", error);
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      <section className="people-directory">
        <div className="people-toolbar">
          <div className="thin-scrollbar flex gap-2 overflow-x-auto pb-1">
            {departments.map((item) => (
              <button
                key={item}
                onClick={() => setDepartment(item)}
                className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm transition ${
                  department === item
                    ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                    : "border-[var(--line)] bg-[var(--paper)] text-[var(--ink)] hover:border-[var(--accent)]"
                }`}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="shrink-0 text-sm text-[var(--muted)]">
            {loading ? "Loading…" : `${filtered.length} people`}
          </p>
        </div>

        <div className="people-list thin-scrollbar">
          {loading && (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-8 text-base text-[var(--muted)]">
              Loading connected profiles…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-8 text-base text-[var(--muted)]">
              No profiles in this view.
            </div>
          )}
          {filtered.map((person) => (
            <button
              key={person.empId}
              onClick={() => openPerson(person)}
              className="person-card group"
            >
              <span
                className="person-avatar"
                style={{ backgroundColor: departmentColor(person.department) }}
              >
                {initials(person.name)}
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="person-name">{person.name}</span>
                <span className="person-title">{person.title}</span>
                <span className="person-meta">
                  {person.department} · {person.location ?? "Location not recorded"}
                </span>
              </span>
              <span className="person-action">
                Open profile <span aria-hidden="true">→</span>
              </span>
            </button>
          ))}
        </div>
      </section>

      {selected && (
        <div className="chat-backdrop" role="presentation" onMouseDown={closePerson}>
          <section
            className="chat-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={`Chat with ${selected.name}`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="chat-header">
              <div className="flex min-w-0 items-center gap-4">
                <span
                  className="person-avatar h-14 w-14 shrink-0 text-lg"
                  style={{ backgroundColor: departmentColor(selected.department) }}
                >
                  {initials(selected.name)}
                </span>
                <div className="min-w-0">
                  <p className="chat-eyebrow">
                    {selected.department} · {selected.empId}
                  </p>
                  <h2 className="truncate font-serif text-3xl tracking-[-.04em]">
                    {selected.name}
                  </h2>
                  <p className="truncate text-sm text-[var(--muted)]">
                    {selected.title}
                    {selected.location ? ` · ${selected.location}` : ""}
                  </p>
                </div>
              </div>
              <button
                onClick={closePerson}
                className="close-button"
                aria-label="Close employee profile"
              >
                ×
              </button>
            </header>

            <div className="chat-content thin-scrollbar">
              <div className="chat-facts">
                <p className="chat-eyebrow">Known from connected records</p>
                <ul className="mt-3 space-y-2">
                  {(selected.groundedFacts ?? []).map((fact) => (
                    <li key={fact} className="text-sm leading-6 text-[var(--muted)]">
                      <span className="mr-2 text-[var(--accent)]">•</span>
                      {fact}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="chat-thread">
                {conversation.length === 0 && (
                  <div className="chat-empty">
                    <span className="chat-empty-mark">?</span>
                    <p className="text-base font-medium text-[var(--ink)]">
                      Start a focused conversation
                    </p>
                    <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                      Ask about this person&apos;s role, recorded work, or an
                      evidence gap. The agent will not invent task updates.
                    </p>
                  </div>
                )}
                {conversation.map((entry, index) => (
                  <div key={`${entry.question}-${index}`} className="space-y-3">
                    <p className="chat-question">{entry.question}</p>
                    <div className="chat-answer">
                      <p className="text-sm leading-6 text-[var(--ink)]">
                        {entry.answer}
                      </p>
                      <span className="chat-provenance">
                        {entry.provenance.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                ))}
                {asking && <p className="chat-thinking">Consulting connected context…</p>}
              </div>
            </div>

            <form onSubmit={ask} className="chat-composer">
              <input
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                placeholder={`Ask ${selected.name.split(" ")[0]} a question…`}
                className="chat-input"
                autoFocus
              />
              <button disabled={asking} className="chat-send">
                {asking ? "…" : "Send"}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
