import { createServerSupabaseClient } from "@/lib/supabase/server";
import { analyzeEvidence, filterEvidenceAsOf, riskFingerprint } from "@/lib/analysis/risk";
import { analyzeCorpus } from "@/lib/analysis/corpus";
import { loadDirectory, personFacts } from "@/lib/people/directory";
import { loadAnalysisEvidence } from "@/lib/analysis/evidence";

type Supabase = ReturnType<typeof createServerSupabaseClient>;

async function saveFinding(
  supabase: Supabase,
  finding: NonNullable<Awaited<ReturnType<typeof analyzeEvidence>>>["risks"][number],
) {
  const fingerprint = riskFingerprint(finding);
  const row = {
    risk_key: `analysis:${fingerprint.slice(0, 16)}`,
    fingerprint,
    title: finding.title,
    description: finding.description,
    severity: finding.severity,
    likelihood: finding.likelihood,
    confidence: finding.confidence,
    status: "open",
    origin: "analysis",
    evidence_count: finding.evidence_ids.length,
    last_reviewed_at: new Date().toISOString(),
  };
  const extended = {
    ...row,
    observed: finding.observed,
    inference: finding.inference,
    recommended_action: finding.recommended_action,
    polarity: finding.polarity,
    area: finding.area,
    owner_employee_key: finding.owner_employee_key,
  };
  // A database without the newer columns still gets the finding saved.
  let saved = await supabase.from("risk_items").upsert(extended, { onConflict: "risk_key" }).select("id").single();
  if (saved.error?.code === "42703" || saved.error?.code === "PGRST204") {
    saved = await supabase.from("risk_items").upsert(row, { onConflict: "risk_key" }).select("id").single();
  }
  if (saved.error) throw new Error(saved.error.message);

  await supabase.from("risk_evidence").delete().eq("risk_id", saved.data.id);
  const links = finding.evidence_ids.map((evidenceId) => ({
    risk_id: saved.data.id,
    evidence_item_id: evidenceId,
    rationale: finding.rationale[evidenceId] ?? null,
  }));
  let linked = await supabase.from("risk_evidence").insert(links);
  if (linked.error?.code === "42703" || linked.error?.code === "PGRST204") {
    linked = await supabase.from("risk_evidence").insert(
      links.map((link) => ({ risk_id: link.risk_id, evidence_item_id: link.evidence_item_id })),
    );
  }
  if (linked.error) throw new Error(linked.error.message);
  return fingerprint;
}

export async function POST() {
  const supabase = createServerSupabaseClient();
  const asOf = new Date().toISOString();
  const run = await supabase.from("analysis_runs").insert({ status: "running" }).select("id").single();
  if (run.error) return Response.json({ error: run.error.message }, { status: 502 });

  try {
    const evidence = filterEvidenceAsOf(await loadAnalysisEvidence(supabase, asOf), new Date(asOf));
    // The directory (not raw rows) so reported statuses such as a fresh
    // resignation reach the analysis.
    const people = (await loadDirectory(supabase, new Date(asOf))).filter((person) => person.isActive);
    const analysis = await analyzeCorpus(
      evidence,
      new Date(asOf),
      people.map((person) => ({
        key: person.empId,
        name: person.name,
        title: person.title,
        department: person.department,
        status: person.status !== "Active" ? personFacts(person).find((fact) => fact.startsWith("Status:")) : undefined,
      })),
    );
    if (analysis === null) {
      // Live analysis failed: keep every stored finding untouched.
      const stored = await supabase
        .from("risk_items")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "watch"]);
      if (stored.error) throw new Error(stored.error.message);
      await supabase.from("analysis_runs").update({
        status: "failed",
        completed_at: new Date().toISOString(),
        evidence_considered: evidence.length,
        error_message: "Live analysis unavailable; stored findings kept.",
      }).eq("id", run.data.id);
      return Response.json({
        run_id: run.data.id,
        mode: "stored",
        evidence_considered: evidence.length,
        risks_created: 0,
        stored_open_findings: stored.count ?? 0,
      });
    }

    const byTitle = new Map<string, (typeof analysis.risks)[number]>();
    for (const finding of analysis.risks) {
      const key = finding.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      const existing = byTitle.get(key);
      if (!existing || finding.evidence_ids.length > existing.evidence_ids.length) byTitle.set(key, finding);
    }
    const findings = [...byTitle.values()];
    const activeFingerprints = new Set<string>();
    for (const finding of findings) activeFingerprints.add(await saveFinding(supabase, finding));

    // Anything from an earlier analysis that this run no longer supports is closed.
    const previous = await supabase
      .from("risk_items")
      .select("id, fingerprint")
      .eq("origin", "analysis")
      .in("status", ["open", "watch"]);
    if (previous.error) throw new Error(previous.error.message);
    const staleIds = (previous.data ?? [])
      .filter((risk) => !risk.fingerprint || !activeFingerprints.has(risk.fingerprint))
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
      risks_created: findings.length,
      model_version: analysis.model,
    }).eq("id", run.data.id);
    return Response.json({
      run_id: run.data.id,
      mode: "live",
      model: analysis.model,
      evidence_considered: evidence.length,
      concerns: findings.filter((finding) => finding.polarity === "concern").length,
      positives: findings.filter((finding) => finding.polarity === "positive").length,
      closed: staleIds.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Risk analysis failed.";
    await supabase.from("analysis_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: message }).eq("id", run.data.id);
    console.error("Risk analysis failed", error);
    return Response.json({ error: message, run_id: run.data.id }, { status: 502 });
  }
}
