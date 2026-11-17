import { createServerSupabaseClient } from "@/lib/supabase/server";
import { analyzeEvidence, filterEvidenceAsOf, riskFingerprint } from "@/lib/analysis/risk";
import { embedTexts } from "@/lib/rag/embeddings";

type EvidenceRow = {
  evidence_id: string;
  evidence_text: string;
  source_title: string;
  locator: string;
};

async function loadAnalysisEvidence(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  vectors: number[][],
  asOf: string,
) {
  const retrieved = new Map<string, EvidenceRow>();
  for (const vector of vectors) {
    const result = await supabase.rpc("match_evidence", {
      query_embedding: vector,
      match_threshold: 0.48,
      match_count: 8,
      as_of: asOf,
    });
    if (result.error) {
      if (!result.error.message.includes("match_evidence")) throw new Error(result.error.message);
      break;
    }
    for (const row of (result.data ?? []) as EvidenceRow[]) retrieved.set(row.evidence_id, row);
  }
  if (retrieved.size > 0) return [...retrieved.values()];

  const fallback = await supabase
    .from("evidence_items")
    .select(
      "id, evidence_text, source_locations(locator, source_documents(title))",
    )
    .eq("is_sensitive", false)
    .not("embedding", "is", null)
    .lte("available_at", asOf)
    .order("available_at", { ascending: false })
    .limit(80);
  if (fallback.error) throw new Error(fallback.error.message);
  return ((fallback.data ?? []) as unknown as Array<{
    id: string;
    evidence_text: string;
    source_locations: Array<{ locator: string; source_documents: Array<{ title: string }> }>;
  }>).map((item) => ({
    evidence_id: item.id,
    evidence_text: item.evidence_text,
    source_title: item.source_locations?.[0]?.source_documents?.[0]?.title ?? "Unknown source",
    locator: item.source_locations?.[0]?.locator ?? "",
  }));
}

export async function POST() {
  const supabase = createServerSupabaseClient();
  const asOf = new Date().toISOString();
  const run = await supabase.from("analysis_runs").insert({ status: "running" }).select("id").single();
  if (run.error) return Response.json({ error: run.error.message }, { status: 502 });

  try {
    const analysisQueries = [
      "delivery schedule launch reliability incidents engineering workload and unresolved bugs",
      "cash burn revenue ARR financial controls payroll exceptions and accounting discrepancies",
      "hiring plans employee departures retention leave and team capacity",
      "internal workload imbalance overloaded employees underused employees team capacity leave absences unresolved employee concerns and management coverage",
      "employee wellbeing burnout conflict payroll questions retention signals and operational handoffs",
      "customer commitments invoices launch readiness and operational dependencies",
      "leadership priorities conflicting metrics assumptions and missing evidence",
    ];
    let queryVectors: number[][] = [];
    try {
      queryVectors = await embedTexts(analysisQueries, "RETRIEVAL_QUERY");
    } catch (error) {
      console.error("Risk query embedding unavailable; using embedded corpus fallback", error);
    }
    const retrieved = await loadAnalysisEvidence(supabase, queryVectors, asOf);
    const evidence = retrieved.map((item) => ({
      id: item.evidence_id,
      text: item.evidence_text,
      source: `${item.source_title} · ${item.locator}`,
    }));
    const risks = await analyzeEvidence(filterEvidenceAsOf(evidence, new Date(asOf)), new Date(asOf));
    let risksCreated = 0;
    const activeFingerprints = new Set<string>();
    for (const risk of risks) {
      const fingerprint = riskFingerprint(risk);
      activeFingerprints.add(fingerprint);
      const saved = await supabase.from("risk_items").upsert({
        risk_key: `analysis:${fingerprint.slice(0, 16)}`,
        fingerprint,
        title: risk.title,
        description: risk.description,
        severity: risk.severity,
        likelihood: risk.likelihood,
        confidence: risk.confidence,
        status: "open",
        origin: "analysis",
        evidence_count: risk.evidence_ids.length,
        last_reviewed_at: new Date().toISOString(),
      }, { onConflict: "risk_key" }).select("id").single();
      if (saved.error) throw new Error(saved.error.message);
      await supabase.from("risk_evidence").delete().eq("risk_id", saved.data.id);
      const links = await supabase.from("risk_evidence").insert(
        risk.evidence_ids.map((evidenceId) => ({ risk_id: saved.data.id, evidence_item_id: evidenceId })),
      );
      if (links.error) throw new Error(links.error.message);
      risksCreated += 1;
    }
    const previous = await supabase
      .from("risk_items")
      .select("id, fingerprint")
      .eq("origin", "analysis")
      .in("status", ["open", "watch"]);
    if (previous.error) throw new Error(previous.error.message);
    const staleIds = (previous.data ?? [])
      .filter((risk) => risk.fingerprint && !activeFingerprints.has(risk.fingerprint))
      .map((risk) => risk.id);
    if (staleIds.length > 0) {
      const closed = await supabase
        .from("risk_items")
        .update({ status: "closed", last_reviewed_at: new Date().toISOString() })
        .in("id", staleIds);
      if (closed.error) throw new Error(closed.error.message);
    }

    await supabase.from("analysis_runs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      evidence_considered: evidence.length,
      risks_created: risksCreated,
      model_version: process.env.GEMINI_CHAT_MODEL ?? "gemini-3.8-flash",
    }).eq("id", run.data.id);
    return Response.json({ run_id: run.data.id, evidence_considered: evidence.length, risks_created: risksCreated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Risk analysis failed.";
    await supabase.from("analysis_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: message }).eq("id", run.data.id);
    console.error("Risk analysis failed", error);
    return Response.json({ error: message, run_id: run.data.id }, { status: 502 });
  }
}
