import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const asOf = new Date().toISOString();
    const riskQuery = supabase
      .from("risk_items")
      .select(
        "id, risk_key, title, description, severity, likelihood, status, confidence",
      )
      .eq("origin", "analysis")
      .in("status", ["open", "watch"])
      .order("severity", { ascending: false })
      .limit(3);
    const [people, evidence, documents, risks] = await Promise.all([
      supabase
        .from("employee_profiles")
        .select("employee_key, department")
        .eq("is_active", true),
      supabase
        .from("evidence_items")
        .select("id, embedding", { count: "exact", head: false })
        .eq("is_sensitive", false)
        .lte("available_at", asOf),
      supabase
        .from("source_documents")
        .select("id, title, source_type, release_day, available_at")
        .lte("available_at", asOf)
        .order("available_at", { ascending: false })
        .limit(4),
      riskQuery,
    ]);

    for (const result of [people, evidence, documents]) {
      if (result.error) throw new Error(result.error.message);
    }
    const analysisReady = !risks.error || risks.error.code !== "42703";
    if (risks.error && analysisReady) throw new Error(risks.error.message);
    let currentRisks = risks.data ?? [];
    if (analysisReady && currentRisks.length > 0) {
      const links = await supabase
        .from("risk_evidence")
        .select("risk_id, evidence_items!inner(available_at)")
        .in("risk_id", currentRisks.map((risk) => risk.id))
        .lte("evidence_items.available_at", asOf);
      if (links.error) throw new Error(links.error.message);
      const currentRiskIds = new Set((links.data ?? []).map((link) => link.risk_id));
      currentRisks = currentRisks.filter((risk) => currentRiskIds.has(risk.id));
    }

    const departmentCounts = (people.data ?? []).reduce<Record<string, number>>(
      (counts, person) => {
        counts[person.department ?? "Unassigned"] =
          (counts[person.department ?? "Unassigned"] ?? 0) + 1;
        return counts;
      },
      {},
    );

    return Response.json({
      stats: {
        people: people.data?.length ?? 0,
        evidence: evidence.data?.length ?? 0,
        embedded: (evidence.data ?? []).filter((item) => item.embedding).length,
        departments: departmentCounts,
      },
      latestSources: documents.data ?? [],
      priorityRisks: analysisReady ? currentRisks : [],
      analysisReady,
    });
  } catch (error) {
    console.error("Dashboard data query failed", error);
    return Response.json(
      { error: "Unable to load dashboard data." },
      { status: 502 },
    );
  }
}
