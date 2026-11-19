"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AS_OF_COOKIE, todayIst } from "@/lib/time/as-of";
import { useNow } from "@/components/useNow";

type Doc = { id: string; title: string; source_type: string; effectiveDate: string; dateIsFromDocument: boolean; release_day: string | null };

function readCookie() {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split("; ").find((part) => part.startsWith(`${AS_OF_COOKIE}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

export function setViewingDay(day: string | null) {
  // A year is plenty; "today" clears the cookie.
  document.cookie = day
    ? `${AS_OF_COOKIE}=${encodeURIComponent(day)}; path=/; max-age=31536000; samesite=lax`
    : `${AS_OF_COOKIE}=; path=/; max-age=0; samesite=lax`;
  window.location.reload();
}

const label = (day: string, today = "") =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short", year: !today || day.slice(0, 4) === today.slice(0, 4) ? undefined : "numeric" });

/** The day being viewed, from the cookie (client side). */
export function useViewingDay() {
  const [day, setDay] = useState<string | null>(null);
  useEffect(() => {
    // Cookie and clock are only read in the browser (never during prerender).
    const saved = readCookie();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDay(saved && saved < todayIst() ? saved : null);
  }, []);
  return day;
}

const shiftDay = (day: string, by: number) =>
  new Date(new Date(`${day}T12:00:00Z`).getTime() + by * 86_400_000).toISOString().slice(0, 10);

const KIND: Record<string, [string, string]> = {
  email: ["email", "emails"],
  spreadsheet: ["spreadsheet", "spreadsheets"],
  transcript: ["call", "calls"],
  pdf: ["document", "documents"],
};

/** "13 documents: 6 spreadsheets, 4 emails, 2 calls" for a release day. */
function describe(docs: Doc[]) {
  const counts = new Map<string, number>();
  for (const doc of docs) counts.set(doc.source_type, (counts.get(doc.source_type) ?? 0) + 1);
  const parts = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([kind, count]) => `${count} ${(KIND[kind] ?? [kind, `${kind}s`])[count === 1 ? 0 : 1]}`);
  return `${docs.length} ${docs.length === 1 ? "document" : "documents"}: ${parts.join(", ")}`;
}

/**
 * "Time machine": view the company as known at the end of a past day.
 * Everything is readable without hovering: step a day at a time, jump to a
 * release day (with what arrived), or to a dated moment in the documents
 * (with its title). Stored in a cookie so every page and API follows it.
 */
export default function TimeMachine({ compact = false }: { compact?: boolean }) {
  const viewing = useViewingDay();
  const [open, setOpen] = useState(false);
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  // Clock read in the browser only, so prerendering never sees new Date().
  const now = useNow();
  const today = now ? todayIst(now) : "";
  const current = viewing ?? today;

  useEffect(() => {
    if (!open || docs || !today) return;
    // Always the full timeline, whatever day is being viewed.
    fetch(`/api/timeline?asOf=${today}`)
      .then((response) => response.json())
      .then((result) => setDocs(result.sources ?? []))
      .catch(() => setDocs([]));
  }, [open, docs, today]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  const go = (day: string) => setViewingDay(day >= today ? null : day);

  const releases = useMemo(() => {
    const byDay = new Map<string, Doc[]>();
    for (const doc of docs ?? []) if (doc.release_day) byDay.set(doc.release_day, [...(byDay.get(doc.release_day) ?? []), doc]);
    return [...byDay.entries()].sort((left, right) => left[0].localeCompare(right[0])).map(([day, list], index) => ({ day, index: index + 1, list }));
  }, [docs]);

  // Dated moments in the documents, newest first, titles visible.
  const moments = useMemo(
    () => (docs ?? []).filter((doc) => doc.dateIsFromDocument).sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate)),
    [docs],
  );

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`time-trigger ${viewing ? "is-past" : ""}`}
        aria-expanded={open}
        aria-label={viewing ? `Viewing ${label(viewing, today)}. Change date` : "View the company as of another date"}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 12a9 9 0 1 0 3 -6.7" /><path d="M3 4v4h4" /><path d="M12 7v5l3 3" />
        </svg>
        {!compact && <span>{viewing ? label(viewing, today) : "Today"}</span>}
      </button>

      {open && today && (
        <div className="time-panel" role="dialog" aria-label="Time machine">
          <p className="section-eyebrow text-[var(--brand-2)]">Time machine</p>
          <p className="mt-1 text-sm text-[var(--muted)]">See the company as it was known at the end of a day.</p>

          <div className="time-stepper" role="group" aria-label="Step through days">
            <button type="button" onClick={() => go(shiftDay(current, -1))} aria-label="Previous day">‹</button>
            <div>
              <strong>{viewing ? new Date(`${current}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "long" }) : "Today"}</strong>
              <span>{viewing ? "as known at the end of the day" : "live"}</span>
            </div>
            <button type="button" onClick={() => go(shiftDay(current, 1))} disabled={!viewing} aria-label="Next day">›</button>
          </div>

          {docs === null ? (
            <p className="mt-4 text-sm text-[var(--muted)]">Loading the timeline…</p>
          ) : (
            <>
              <p className="people-detail-label mt-4">When documents arrived</p>
              <ul className="mt-1.5 space-y-1">
                {releases.map((release) => (
                  <li key={release.day}>
                    <button
                      type="button"
                      className={`time-row is-release ${current === release.day || (!viewing && release.day === today) ? "is-on" : ""}`}
                      onClick={() => go(release.day)}
                    >
                      <span className="time-row-date">Day {release.index} · {label(release.day, today)}</span>
                      <span className="time-row-text">{describe(release.list)}</span>
                    </button>
                  </li>
                ))}
              </ul>

              <p className="people-detail-label mt-4">Key dates in the documents</p>
              <ul className="time-moments thin-scrollbar mt-1.5 space-y-1">
                {moments.map((doc) => (
                  <li key={doc.id}>
                    <button type="button" className={`time-row ${current === doc.effectiveDate ? "is-on" : ""}`} onClick={() => go(doc.effectiveDate)}>
                      <span className="time-row-date">{label(doc.effectiveDate, today)}</span>
                      <span className="time-row-text">{doc.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3">
            <label className="flex items-center gap-2 text-xs text-[var(--muted)]">
              Any day
              <input
                type="date"
                max={today}
                defaultValue={current}
                onChange={(event) => event.target.value && go(event.target.value)}
                className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)]"
              />
            </label>
            {viewing && (
              <button type="button" className="time-chip is-on" onClick={() => setViewingDay(null)}>Back to today</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
