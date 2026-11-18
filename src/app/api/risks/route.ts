import { selectRiskItems } from "@/lib/data/fallback";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dedupeAndRankRisks } from "@/lib/analysis/risk";
import { humanizeConcernText } from "@/lib/evidence/snippet";

type RiskRow = {
  id: string;
  title: string;
  description: string;
  inference?: string | null;
  recommended_action?: string | null;
  severity: string;
  likelihood: string | null;
  last_reviewed_at: string | null;
  [key: string]: unknown;
};

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const asOf = new Date().toISOString();
    const { data: rows, error } = await selectRiskItems(
      "id, risk_key, title, description, inference, recommended_action, polarity, area, owner_employee_key, evidence_count, severity, likelihood, status, confidence, origin, first_observed_at, last_reviewed_at",
      (select) =>
        supabase.from("risk_items").select(select).in("status", ["open", "watch"]).limit(40),
    );
    const data = rows as unknown as RiskRow[] | null;

    if (error?.code === "42703") {
      return Response.json({ risks: [], analysisReady: false });
    }
    if (error) throw new Error(error.message);
    const risks = (data ?? []).map((risk) => ({
      ...risk,
      title: humanizeConcernText(risk.title),
      description: humanizeConcernText(risk.description),
      inference: risk.inference ? humanizeConcernText(risk.inference) : null,
      recommended_action: risk.recommended_action ? humanizeConcernText(risk.recommended_action) : null,
    }));
    if (risks.length === 0) return Response.json({ risks: [], analysisReady: true });
    const links = await supabase
      .from("risk_evidence")
      .select("risk_id, evidence_items!inner(available_at)")
      .in("risk_id", risks.map((risk) => risk.id))
      .lte("evidence_items.available_at", asOf);
    if (links.error) throw new Error(links.error.message);
    const currentRiskIds = new Set((links.data ?? []).map((link) => link.risk_id));
    return Response.json({
      risks: dedupeAndRankRisks(
        risks.filter((risk) => currentRiskIds.has(risk.id)),
      ),
      analysisReady: true,
    });
  } catch (error) {
    console.error("Risk data query failed", error);
    return Response.json({ error: "Unable to load risks." }, { status: 502 });
  }
}
