"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ChatPanel, { type ChatPerson } from "@/components/people/ChatPanel";
import PageLoader from "@/components/PageLoader";
import { areaColor } from "@/components/pills";

type Person = ChatPerson & { isPersona?: boolean; isActive: boolean; status: string };

/** Full-page chat: the conversation, plus everyone else you can talk to. */
export default function ChatPage() {
  const params = useParams<{ employeeKey: string }>();
  const [people, setPeople] = useState<Person[] | null>(null);

  useEffect(() => {
    fetch("/api/people")
      .then((response) => response.json())
      .then((result) => setPeople(result.people ?? []))
      .catch(() => setPeople([]));
  }, []);

  if (!people) return <PageLoader lines={["Opening the conversation"]} />;
  const personas = people.filter((person) => person.isPersona);
  const departments = [...new Set(people.map((person) => person.department))].sort();
  const person = personas.find((entry) => entry.empId === params.employeeKey);

  return (
    <div className="chat-page">
      <aside className="chat-page-list thin-scrollbar" aria-label="People you can talk to">
        <Link href="/people" className="text-xs font-semibold text-[var(--muted)] hover:text-[var(--ink)]">← People</Link>
        <p className="section-eyebrow mt-4 text-[var(--accent)]">Talk to</p>
        <ul className="mt-2 space-y-1">
          {personas.map((entry) => (
            <li key={entry.empId}>
              <Link
                href={`/chat/${entry.empId}`}
                aria-current={entry.empId === params.employeeKey ? "page" : undefined}
                className="chat-page-person"
              >
                <span className="team-dot" style={{ background: areaColor(entry.department, departments) }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{entry.name}</span>
                  <span className="block truncate text-xs text-[var(--muted)]">{entry.title}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <section className="chat-page-panel">
        {person ? (
          <ChatPanel key={person.empId} person={person} color={areaColor(person.department, departments)} variant="page" />
        ) : (
          <p className="p-8 text-sm text-[var(--muted)]">
            That person isn&apos;t someone you can chat with here. Pick someone from the list.
          </p>
        )}
      </section>
    </div>
  );
}
