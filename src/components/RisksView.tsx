"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AreaPill, ConfidencePill, SeverityPill } from "@/components/pills";

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

export default function RisksView() {
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const [area, setArea] = useState("All");

  useEffect(() => {
    fetch("/api/risks")
      .then((response) => response.json())
      .then((result) => setFindings(result.risks ?? []))
      .catch((error) => console.error("Findings request failed", error))
      .finally(() => setLoading(false));
  }, []);

  const areas = useMemo(
    () => [...new Set(findings.map((finding) => finding.area).filter((value): value is string => Boolean(value)))].sort(),
    [findings],
  );
  const inArea = (finding: Finding) => area === "All" || finding.area === area;
  const concerns = findings.filter((finding) => finding.polarity !== "positive" && inArea(finding));
  const positives = findings.filter((finding) => finding.polarity === "positive" && inArea(finding));

  const row = (finding: Finding, index: number, positive: boolean) => (
    <Link
      key={finding.id}
      href={`/risks/${encodeURIComponent(finding.risk_key)}`}
      className={`grid gap-x-5 gap-y-3 rounded-2xl border border-[var(--line)] bg-[var(--paper)] px-5 py-5 transition hover:-translate-y-0.5 hover:border-[var(--accent)] hover:shadow-[0_10px_24px_rgba(47,55,48,.08)] sm:grid-cols-[2.5rem_1fr_auto] sm:items-start sm:px-6 ${positive ? "border-l-4 border-l-[var(--good)]" : `border-l-4 ${finding.severity === "high" || finding.severity === "critical" ? "border-l-[var(--critical)]" : finding.severity === "medium" ? "border-l-[var(--warning)]" : ""}`}`}
    >
      <span className="font-serif text-xl text-[var(--muted)]">{String(index + 1).padStart(2, "0")}</span>
      <span className="min-w-0">
        <span className="block text-[17px] font-semibold leading-snug">{finding.title}</span>
        {(finding.observed ?? finding.inference) && (
          <span className="mt-2 block max-w-3xl text-sm leading-6 text-[var(--muted)]">{finding.observed ?? finding.inference}</span>
        )}
        {finding.recommended_action && (
          <span className="next-step mt-3 block max-w-3xl"><span>Next</span>{finding.recommended_action}</span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 sm:max-w-[16rem] sm:justify-end sm:pt-1">
        {positive ? <span className="pill-good">✓ working</span> : <SeverityPill severity={finding.severity} />}
        {finding.area && <AreaPill area={finding.area} all={areas} />}
        <ConfidencePill confidence={finding.confidence} />
      </span>
    </Link>
  );

  return (
    <div>
      {areas.length > 0 && (
        <div className="mb-8 flex flex-wrap gap-2">
          {["All", ...areas].map((item) => (
            <button
              key={item}
              onClick={() => setArea(item)}
              className={`rounded-full border px-3 py-1.5 text-xs ${area === item ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--line)] bg-[var(--paper)]"}`}
            >
              {item}
            </button>
          ))}
        </div>
      )}
      {loading && <p className="text-sm text-[var(--muted)]">Loading…</p>}

      <p className="section-eyebrow text-[var(--critical)]">Going wrong · {concerns.length}</p>
      <div className="mt-3 flex flex-col gap-3">
        {concerns.map((finding, index) => row(finding, index, false))}
        {!loading && concerns.length === 0 && <p className="text-sm text-[var(--muted)]">Nothing open here.</p>}
      </div>

      {positives.length > 0 && (
        <>
          <p id="going-well" className="section-eyebrow mt-12 scroll-mt-28 text-[var(--good)]">Going well · {positives.length}</p>
          <div className="mt-3 flex flex-col gap-3">
            {positives.map((finding, index) => row(finding, index, true))}
          </div>
        </>
      )}
    </div>
  );
}
