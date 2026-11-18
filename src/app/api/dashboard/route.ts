import { selectRiskItems } from "@/lib/data/fallback";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dedupeAndRankRisks } from "@/lib/analysis/risk";
import { friendlySourceTitle, humanizeConcernText } from "@/lib/evidence/snippet";

type RiskRow = {
  id: string;
  risk_key: string;
  title: string;
  description: string;
  observed?: string | null;
  inference?: string | null;
  recommended_action?: string | null;
  polarity?: string | null;
  severity: string;
  likelihood: string | null;
  confidence: string | null;
  evidence_count?: number | null;
  origin?: string | null;
  last_reviewed_at: string | null;
};

const text = (value?: string | null) => (value ? humanizeConcernText(value) : null);

/**
 * The CEO's morning brief. Everything is read from the database: the CEO is
 * whoever sits at the top of the HR master's reporting line.
 */
export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const asOf = new Date().toISOString();
    const [people, evidence, documents, risks, lastRun] = await Promise.all([
      supabase
        .from("employee_profiles")
        .select("employee_key, display_name, role_title, department, is_active, profile"),
      supabase
        .from("evidence_items")
        .select("id", { count: "exact", head: true })
        .eq("is_sensitive", false)
        .lte("available_at", asOf),
      supabase
        .from("source_documents")
        .select("id, title, source_type, release_day, available_at")
        .lte("available_at", asOf)
        .order("available_at", { ascending: false })
        .limit(40),
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
    ]);
    for (const result of [people, evidence, documents]) {
      if (result.error) throw new Error(result.error.message);
    }
    if (risks.error) throw new Error(risks.error.message);

    // Only findings whose evidence is released as of now.
    let rows = (risks.data ?? []) as unknown as RiskRow[];
    if (rows.length > 0) {
      const links = await supabase
        .from("risk_evidence")
        .select("risk_id, evidence_items!inner(available_at)")
        .in("risk_id", rows.map((risk) => risk.id))
        .lte("evidence_items.available_at", asOf);
      if (links.error) throw new Error(links.error.message);
      const current = new Set((links.data ?? []).map((link) => link.risk_id));
      rows = rows.filter((risk) => current.has(risk.id));
    }
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
    );

    const activePeople = (people.data ?? []).filter((person) => person.is_active);
    // The CEO is the person at the top of the reporting tree: no manager of
    // their own, and at least one person reporting to them. Without reporting
    // data (directory not yet synced) there is no CEO to greet.
    const managerOf = (person: (typeof activePeople)[number]) =>
      (person.profile as { managerKey?: string | null } | null)?.managerKey ?? null;
    const ceo =
      activePeople.find(
        (person) =>
          !managerOf(person) &&
          activePeople.some((other) => managerOf(other) === person.employee_key),
      ) ?? null;
    const departments = activePeople.reduce<Record<string, number>>((counts, person) => {
      const name = person.department ?? "Unassigned";
      counts[name] = (counts[name] ?? 0) + 1;
      return counts;
    }, {});

    const sources = (documents.data ?? []).map((document) => ({
      ...document,
      title: friendlySourceTitle(document.title),
    }));
    const latestDay = sources[0]?.release_day ?? null;

    return Response.json({
      ceo: ceo ? { name: ceo.display_name, title: ceo.role_title } : null,
      stats: {
        people: activePeople.length,
        evidence: evidence.count ?? 0,
        sources: sources.length,
        departments,
      },
      concerns: findings.filter((finding) => finding.polarity !== "positive"),
      positives: findings.filter((finding) => finding.polarity === "positive"),
      latestDay,
      newSources: sources.filter((source) => source.release_day === latestDay),
      lastAnalysis: lastRun.data
        ? { at: lastRun.data.completed_at, model: lastRun.data.model_version }
        : null,
    });
  } catch (error) {
    console.error("Dashboard data query failed", error);
    return Response.json({ error: "Unable to load the morning brief." }, { status: 502 });
  }
}
