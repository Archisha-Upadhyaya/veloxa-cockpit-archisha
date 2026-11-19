"use client";

import { useEffect, useState } from "react";
import Logo from "@/components/Logo";
import PageLoader from "@/components/PageLoader";

type Finding = {
  id: string;
  title: string;
  observed?: string | null;
  inference?: string | null;
  recommended_action?: string | null;
  severity: string;
  confidence?: string | null;
  area?: string | null;
  owner_employee_key?: string | null;
  evidence_count?: number | null;
};
type Doc = { id: string; title: string; effectiveDate: string; dateIsFromDocument: boolean; available_at: string; source_type: string };
type Brief = {
  asOf: string;
  historical: boolean;
  ceo: { name: string; title: string } | null;
  stats: { people: number; sources: number; departments: Record<string, number> };
  concerns: Finding[];
  positives: Finding[];
  changes: { since: string; dated: Doc[]; received: Doc[]; people: string[] };
};
type Area = { area: string; status: string; headline: string; contact: { name: string } | null };
type Flag = { name: string; level: string; reasons: Array<{ text: string; source: string }>; suggestion: string };
type Person = { empId: string; name: string; title: string };

const longDate = (day: string) =>
  new Date(`${day.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDate = (day: string) =>
  new Date(`${day.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const STATUS: Record<string, string> = { act: "Needs you", watch: "Keep an eye", good: "Going well", unknown: "No data" };

/**
 * The brief as a printable A4 document. Everything comes from the same APIs
 * as the site (and follows the date being viewed); "Download PDF" uses the
 * browser's print-to-PDF so text stays sharp and selectable.
 */
export default function ReportView() {
  const [data, setData] = useState<{ brief: Brief; areas: Area[]; checkedAt: string | null; flags: Flag[]; people: Person[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/dashboard").then((response) => response.json()),
      fetch("/api/health-check").then((response) => response.json()).catch(() => ({ check: null })),
      fetch("/api/retention-check").then((response) => response.json()).catch(() => ({ check: null })),
      fetch("/api/people").then((response) => response.json()).catch(() => ({ people: [] })),
    ])
      .then(([brief, health, retention, people]) => {
        if (brief.error) throw new Error(brief.error);
        setData({
          brief,
          areas: health.check?.areas ?? [],
          checkedAt: health.check?.checkedAt ?? null,
          flags: retention.check?.people ?? [],
          people: people.people ?? [],
        });
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "The brief couldn't be loaded."));
  }, []);

  if (error) return <main className="mx-auto max-w-3xl p-8 text-sm text-[var(--muted)]">{error}</main>;
  if (!data) return <PageLoader fullScreen lines={["Preparing the brief", "Laying out the pages"]} />;

  const { brief, areas, checkedAt, flags, people } = data;
  const nameOf = (key?: string | null) => people.find((person) => person.empId === key);
  const good = areas.filter((area) => area.status === "good");

  return (
    <div className="report-shell">
      <div className="report-toolbar print:hidden">
        <p className="text-sm text-[var(--muted)]">A4 document. Use “Download PDF”, then choose “Save as PDF”.</p>
        <button type="button" className="talk-button" onClick={() => window.print()}>Download PDF</button>
      </div>

      <article className="report-page">
        <header className="report-head">
          <div className="flex items-center gap-3">
            <Logo size={44} />
            <div>
              <p className="report-company">Veloxa</p>
              <p className="report-kicker">CEO brief</p>
            </div>
          </div>
          <div className="text-right">
            <p className="report-date">{longDate(brief.asOf)}</p>
            <p className="report-meta">
              {brief.historical ? "As known at the end of that day" : "As of today"}
              {brief.ceo ? ` · Prepared for ${brief.ceo.name}, ${brief.ceo.title}` : ""}
            </p>
          </div>
        </header>

        <section className="report-summary">
          <div><span>{brief.concerns.length}</span>open concerns</div>
          <div><span>{good.length}{areas.length ? `/${areas.length}` : ""}</span>areas going well</div>
          <div><span>{flags.length}</span>people to check in with</div>
          <div><span>{brief.stats.people}</span>people · {Object.keys(brief.stats.departments).length} teams</div>
        </section>

        <section className="report-section">
          <h2>What needs your attention</h2>
          {brief.concerns.length === 0 && <p className="report-muted">No open concerns.</p>}
          <ol className="report-concerns">
            {brief.concerns.map((concern, index) => {
              const owner = nameOf(concern.owner_employee_key);
              return (
                <li key={concern.id} className="report-concern">
                  <div className="report-concern-head">
                    <span className="report-rank">{String(index + 1).padStart(2, "0")}</span>
                    <h3>{concern.title}</h3>
                    <span className={`report-sev sev-${concern.severity}`}>{concern.severity}</span>
                  </div>
                  {concern.observed && <p><strong>What the records show.</strong> {concern.observed}</p>}
                  {concern.inference && <p><strong>Why it matters.</strong> {concern.inference}</p>}
                  {concern.recommended_action && <p><strong>Next step.</strong> {concern.recommended_action}</p>}
                  <p className="report-muted">
                    {[concern.area, owner ? `Talk to ${owner.name} (${owner.title})` : null, concern.confidence ? `${concern.confidence} confidence` : null, concern.evidence_count ? `${concern.evidence_count} supporting records` : null].filter(Boolean).join(" · ")}
                  </p>
                </li>
              );
            })}
          </ol>
        </section>

        {(good.length > 0 || brief.positives.length > 0) && (
          <section className="report-section">
            <h2>What is going well</h2>
            <ul className="report-list">
              {good.map((area) => <li key={area.area}><strong>{area.area}.</strong> {area.headline}</li>)}
              {brief.positives.map((positive) => <li key={positive.id}><strong>{positive.title}.</strong> {positive.observed ?? ""}</li>)}
            </ul>
          </section>
        )}

        {areas.length > 0 && (
          <section className="report-section report-break-avoid">
            <h2>Company health</h2>
            <p className="report-muted">Checked {shortDate(checkedAt ?? brief.asOf)}.</p>
            <table className="report-table">
              <thead><tr><th>Area</th><th>Status</th><th>In one line</th><th>Contact</th></tr></thead>
              <tbody>
                {areas.map((area) => (
                  <tr key={area.area}>
                    <td>{area.area}</td>
                    <td><span className={`report-status status-${area.status}`}>{STATUS[area.status] ?? area.status}</span></td>
                    <td>{area.headline}</td>
                    <td>{area.contact?.name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {flags.length > 0 && (
          <section className="report-section report-break-avoid">
            <h2>People to check in with</h2>
            <p className="report-muted">From work records only (workload, on-call, ownership, notice). Reasons to talk, not predictions.</p>
            <ul className="report-list">
              {flags.map((flag) => (
                <li key={flag.name}>
                  <strong>{flag.name}{flag.level === "urgent" ? " (urgent)" : ""}.</strong>{" "}
                  {flag.reasons.map((reason) => reason.text.replace(/[.\s]+$/, "")).join("; ")}. <em>{flag.suggestion}</em>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="report-section report-break-avoid">
          <h2>What changed since yesterday</h2>
          <p className="report-muted">{shortDate(brief.changes.since)} to {shortDate(brief.asOf)}. Dates are those written in each document.</p>
          <ul className="report-list">
            {brief.changes.people.map((change) => <li key={change}>{change}</li>)}
            {brief.changes.received.map((doc) => (
              <li key={doc.id}>
                {doc.title} <span className="report-muted">({doc.dateIsFromDocument ? `dated ${shortDate(doc.effectiveDate)}` : `received ${shortDate(doc.available_at)}`})</span>
              </li>
            ))}
            {brief.changes.people.length + brief.changes.received.length === 0 && <li className="report-muted">Nothing new since yesterday.</li>}
          </ul>
        </section>

        <footer className="report-foot">
          <span>Veloxa · CEO brief · {shortDate(brief.asOf)}</span>
          <span>Built from {brief.stats.sources} company documents. Call transcripts are treated as secondary to company records.</span>
        </footer>
      </article>
    </div>
  );
}
