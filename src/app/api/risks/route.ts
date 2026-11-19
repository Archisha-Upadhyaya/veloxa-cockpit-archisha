import { selectRiskItems } from "@/lib/data/fallback";
import { asOfFromRequest } from "@/lib/time/as-of";
import { findingsKnownAsOf } from "@/lib/time/known";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dedupeAndRankRisks } from "@/lib/analysis/risk";
import { humanizeConcernText } from "@/lib/evidence/snippet";

type RiskRow = {
  id: string;
  title: string;
  description: string;
  observed?: string | null;
  inference?: string | null;
  recommended_action?: string | null;
  severity: string;
  likelihood: string | null;
  last_reviewed_at: string | null;
  [key: string]: unknown;
};

export async function GET(request: Request) {
  try {
    const supabase = createServerSupabaseClient();
    const asOf = asOfFromRequest(request);
    const { data: rows, error } = await selectRiskItems(
      "id, risk_key, title, description, observed, inference, recommended_action, polarity, area, owner_employee_key, evidence_count, severity, likelihood, status, confidence, origin, first_observed_at, last_reviewed_at",
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
      observed: risk.observed ? humanizeConcernText(risk.observed) : null,
      inference: risk.inference ? humanizeConcernText(risk.inference) : null,
      recommended_action: risk.recommended_action ? humanizeConcernText(risk.recommended_action) : null,
    }));
    if (risks.length === 0) return Response.json({ risks: [], analysisReady: true });
    const currentRiskIds = await findingsKnownAsOf(supabase, risks.map((risk) => risk.id), asOf);
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
