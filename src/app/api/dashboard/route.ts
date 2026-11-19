import { selectRiskItems } from "@/lib/data/fallback";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dedupeAndRankRisks } from "@/lib/analysis/risk";
import { loadDirectory, ownerFor, realDepartments } from "@/lib/people/directory";
import { humanizeConcernText } from "@/lib/evidence/snippet";
import { asOfFromRequest } from "@/lib/time/as-of";
import { loadDocuments } from "@/lib/time/documents";
import { findingsKnownAsOf } from "@/lib/time/known";

type RiskRow = {
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
  likelihood: string | null;
  confidence: string | null;
  evidence_count?: number | null;
  origin?: string | null;
  last_reviewed_at: string | null;
};

const text = (value?: string | null) => (value ? humanizeConcernText(value) : null);

/**
 * The CEO's morning brief, as of the day being viewed (today by default).
 * Everything is read from the database: the CEO is whoever sits at the top
 * of the reporting line on that day.
 */
export async function GET(request: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const asOf = asOfFromRequest(request);
    const [documents, risks, lastRun, directory] = await Promise.all([
      loadDocuments(supabase, asOf.at),
      selectRiskItems(
        "id, risk_key, title, description, observed, inference, recommended_action, polarity, area, owner_employee_key, severity, likelihood, confidence, evidence_count, origin, last_reviewed_at",
        (select) => supabase.from("risk_items").select(select).in("status", ["open", "watch"]).limit(60),
      ),
      supabase
        .from("analysis_runs")
        .select("completed_at, model_version, status")
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      loadDirectory(supabase, asOf.at),
    ]);
    if (risks.error) throw new Error(risks.error.message);

    let rows = (risks.data ?? []) as unknown as RiskRow[];
    const known = await findingsKnownAsOf(supabase, rows.map((risk) => risk.id), asOf);
    rows = rows.filter((risk) => known.has(risk.id));

    const findings = dedupeAndRankRisks(
      rows.map((risk) => ({
        ...risk,
        title: humanizeConcernText(risk.title),
        description: humanizeConcernText(risk.description),
        observed: text(risk.observed),
        inference: text(risk.inference),
        recommended_action: text(risk.recommended_action),
        polarity: risk.polarity ?? "concern",
      })),
    ).map((finding) => ({
      ...finding,
      // Owners who have left or moved resolve to the current head of the area.
      owner_employee_key: ownerFor(directory, finding.owner_employee_key, finding.area)?.empId ?? null,
    }));

    const active = directory.filter((person) => person.isActive);
    const ceo = directory.find((person) => person.level === 0 && person.isActive && person.reports.length > 0) ?? null;
    // Teams only: a "department" that is just the CEO is not a team.
    const teams = new Set(realDepartments(directory));
    const departments = active.reduce<Record<string, number>>((counts, person) => {
      if (teams.has(person.department)) counts[person.department] = (counts[person.department] ?? 0) + 1;
      return counts;
    }, {});

    // What changed since yesterday, dated by the documents themselves: things
    // the documents date to yesterday or the viewed day, plus documents that
    // arrived in that window (shown with their own dates).
    const yesterday = new Date(new Date(`${asOf.day}T12:00:00+05:30`).getTime() - 86_400_000).toISOString().slice(0, 10);
    const datedSinceYesterday = documents.filter(
      (document) => document.dateIsFromDocument && document.effectiveDate >= yesterday && document.effectiveDate <= asOf.day,
    );
    const receivedSinceYesterday = documents.filter((document) => {
      const received = new Date(new Date(document.available_at).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
      return received >= yesterday && received <= asOf.day;
    });
    const people = directory.filter((person) => person.isActive);
    const peopleChanges = [
      ...people.filter((person) => person.joined && person.joined >= yesterday && person.joined <= asOf.day).map((person) => `${person.name} joined`),
      ...directory.filter((person) => person.exitDate && person.exitDate >= yesterday && person.exitDate < asOf.day && !person.reported).map((person) => `${person.name} left`),
      ...people.filter((person) => person.reported && person.reported.reportedOn >= yesterday).map((person) => `${person.name}: ${person.status.toLowerCase()} (you reported)`),
      ...people.filter((person) => person.status === "On leave").map((person) => `${person.name} is on leave`),
    ];

    return Response.json({
      asOf: asOf.day,
      historical: asOf.historical,
      ceo: ceo ? { name: ceo.name, title: ceo.title } : null,
      stats: {
        people: active.length,
        sources: documents.length,
        departments,
      },
      concerns: findings.filter((finding) => finding.polarity !== "positive"),
      positives: findings.filter((finding) => finding.polarity === "positive"),
      changes: {
        since: yesterday,
        dated: datedSinceYesterday,
        received: receivedSinceYesterday,
        people: peopleChanges,
      },
      // Out of date only when viewing today and documents arrived after the
      // last successful analysis.
      briefStale:
        !asOf.historical &&
        (!lastRun.data?.completed_at ||
          documents.some((document) => document.available_at > lastRun.data!.completed_at!)),
      lastAnalysis: lastRun.data ? { at: lastRun.data.completed_at, model: lastRun.data.model_version } : null,
    });
  } catch (error) {
    console.error("Dashboard data query failed", error);
    return Response.json({ error: "Unable to load the morning brief." }, { status: 502 });
  }
}
