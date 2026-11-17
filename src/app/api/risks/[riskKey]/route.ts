import { createServerSupabaseClient } from "@/lib/supabase/server";
import { filterEvidenceAsOf } from "@/lib/analysis/risk";

type EvidenceRow = {
  evidence_item_id: string;
  evidence_items:
    | {
        id: string;
        evidence_text: string;
        available_at: string;
        source_locations:
          | { locator: string; source_documents: { title: string } | null }
          | null;
      }
    | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ riskKey: string }> },
) {
  try {
    const { riskKey } = await context.params;
    const supabase = createServerSupabaseClient();
    const asOf = new Date().toISOString();
    const risk = await supabase
      .from("risk_items")
      .select(
        "id, risk_key, title, description, severity, likelihood, status, confidence, first_observed_at, last_reviewed_at",
      )
      .eq("risk_key", decodeURIComponent(riskKey))
      .eq("origin", "analysis")
      .maybeSingle();

    if (risk.error) throw new Error(risk.error.message);
    if (!risk.data) return Response.json({ error: "Concern not found." }, { status: 404 });

    const evidence = await supabase
      .from("risk_evidence")
      .select(
        "evidence_item_id, evidence_items!inner(id, evidence_text, available_at, source_locations(locator, source_documents(title)))",
      )
      .eq("risk_id", risk.data.id)
      .lte("evidence_items.available_at", asOf);
    if (evidence.error) throw new Error(evidence.error.message);

    const rawRecords = (evidence.data ?? []) as unknown as EvidenceRow[];
    const records = filterEvidenceAsOf(
      rawRecords.map((record) => ({
        ...record,
        text: record.evidence_items?.evidence_text ?? "",
      })),
      new Date(asOf),
    );
    if (records.length === 0) {
      return Response.json({ error: "Concern is not available at the current time." }, { status: 404 });
    }

    return Response.json({
      risk: risk.data,
      evidence: records.map((record) => ({
        id: record.evidence_item_id,
        text: record.evidence_items?.evidence_text ?? "",
        source: record.evidence_items?.source_locations?.source_documents?.title ?? "Source record",
        locator: record.evidence_items?.source_locations?.locator ?? "",
        available_at: record.evidence_items?.available_at,
      })),
    });
  } catch (error) {
    console.error("Concern detail query failed", error);
    return Response.json({ error: "Unable to load concern details." }, { status: 502 });
  }
}
