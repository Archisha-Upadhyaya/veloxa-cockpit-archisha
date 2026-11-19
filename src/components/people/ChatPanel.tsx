"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";

export type ChatPerson = {
  empId: string;
  name: string;
  title: string;
  department: string;
  managerName?: string | null;
};

/** answer is null while the reply is on its way. */
type Message = { question: string; answer: string | null; provenance: string };

const storageKey = (empId: string) => `veloxa-chat-${empId}`;

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

const initials = (name: string) => name.split(" ").map((part) => part[0]).slice(0, 2).join("");

/**
 * One conversation with one person, used both in the People drawer and on
 * the full chat page. The thread is kept for the browser session, so
 * "open full page" continues the same conversation.
 */
export default function ChatPanel({
  person,
  color = "var(--accent)",
  variant,
  initialQuestion = "",
  onClose,
}: {
  person: ChatPerson;
  color?: string;
  variant: "drawer" | "page";
  initialQuestion?: string;
  onClose?: () => void;
}) {
  const [question, setQuestion] = useState(initialQuestion);
  const [conversation, setConversation] = useState<Message[]>([]);
  const [asking, setAsking] = useState(false);
  const threadEnd = useRef<HTMLDivElement>(null);
  const firstName = person.name.split(" ")[0];

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(storageKey(person.empId));
      // Restoring a thread kept in this browser session.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setConversation((JSON.parse(saved) as Message[]).filter((entry) => entry.answer !== null));
    } catch {}
  }, [person.empId]);

  useEffect(() => {
    try {
      sessionStorage.setItem(storageKey(person.empId), JSON.stringify(conversation));
    } catch {}
    threadEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation, asking, person.empId]);

  async function ask(event: FormEvent) {
    event.preventDefault();
    const current = question.trim();
    if (!current || asking) return;
    setQuestion("");
    setAsking(true);
    // Show the CEO's message immediately; the reply fills in when it arrives.
    const history = conversation
      .filter((entry) => entry.answer !== null)
      .slice(-6)
      .map((entry) => ({ question: entry.question, answer: entry.answer as string }));
    setConversation((existing) => [...existing, { question: current, answer: null, provenance: "pending" }]);
    const settle = (answer: string, provenance: string) =>
      setConversation((existing) =>
        existing.map((entry, index) =>
          index === existing.length - 1 && entry.answer === null ? { ...entry, answer, provenance } : entry,
        ),
      );
    try {
      const response = await fetch(`/api/people/${person.empId}/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: current, history }),
      });
      const result = await response.json();
      settle(
        result.response?.answer ??
          (result.response?.provenance === "no_record"
            ? `Nothing on record answers that for ${person.name}.`
            : result.error ?? "No response came back. Try asking again."),
        result.response?.provenance ?? "no_visibility",
      );
    } catch {
      settle("I couldn't reach the server. Try again in a moment.", "no_visibility");
    } finally {
      setAsking(false);
    }
  }

  return (
    <>
      <header className="chat-header">
        <div className="flex min-w-0 items-center gap-3">
          <span className="person-avatar" style={{ backgroundColor: color }}>{initials(person.name)}</span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold">{person.name}</h2>
            <p className="truncate text-xs text-[var(--muted)]">
              {person.title}
              {person.managerName ? ` · reports to ${person.managerName}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {variant === "drawer" && (
            <Link
              href={`/chat/${person.empId}`}
              className="close-button"
              aria-label="Open as a full page"
              title="Open as a full page"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M16 4h4v4M14 10l6 -6M8 20h-4v-4M4 20l6 -6" />
              </svg>
            </Link>
          )}
          {variant === "drawer" && onClose && (
            <button onClick={onClose} className="close-button" aria-label="Close chat">×</button>
          )}
        </div>
      </header>

      <div className="chat-thread thin-scrollbar">
        {conversation.length === 0 && !asking && (
          <p className="chat-hint">
            Ask {firstName} anything. They only know what&apos;s in the company&apos;s documents, and will tell you if something isn&apos;t covered.
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
        {asking && <p className="chat-thinking">{firstName} is typing…</p>}
        <div ref={threadEnd} />
      </div>

      <form onSubmit={ask} className="chat-composer">
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={`Message ${firstName}…`}
          className="chat-input"
          autoFocus
        />
        <button disabled={asking || !question.trim()} className="chat-send">Send</button>
      </form>
    </>
  );
}
