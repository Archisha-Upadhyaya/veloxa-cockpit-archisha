/**
 * Remove every row that was written by the retired hand-written seed
 * (scripts/seed-data.ts). Afterwards the database holds only what the
 * data-room ingestion, the HR master sync and live analysis produce.
 *
 * Idempotent: safe to run on every start. Pass --dry-run to only count.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY.");
}
const dryRun = process.argv.includes("--dry-run");
const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function check<T>(result: { data: T; error: { message: string } | null }, label: string) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function main() {
  // Seeded answers and the claims they cite.
  const runs = check(
    await supabase.from("answer_runs").select("id, question").eq("model_version", "day-1-static-grounded"),
    "answer runs",
  ) ?? [];
  const runIds = runs.map((run) => run.id);
  const claimIds = runIds.length
    ? (check(
        await supabase.from("answer_claims").select("claim_id").in("answer_run_id", runIds),
        "answer claims",
      ) ?? []).map((row) => row.claim_id)
    : [];

  // Seeded citations were stored as source documents keyed "day1:E-0xx".
  const documents = check(
    await supabase.from("source_documents").select("id").like("external_key", "day1:%"),
    "seeded documents",
  ) ?? [];
  const risks = check(
    await supabase.from("risk_items").select("id").eq("origin", "bootstrap"),
    "seeded concerns",
  ) ?? [];
  const assumptions = check(
    await supabase.from("assumptions").select("id").like("assumption_ref", "A-VX%"),
    "seeded assumptions",
  ) ?? [];
  const conflicts = runs.length
    ? check(
        await supabase.from("conflicts").select("id").in("subject", runs.map((run) => run.question)),
        "seeded conflicts",
      ) ?? []
    : [];
  // Personas were generated from hand-written interview scripts.
  const personas = check(await supabase.from("agent_personas").select("id"), "personas") ?? [];

  const plan = {
    answer_runs: runIds.length,
    claims: claimIds.length,
    source_documents: documents.length,
    risk_items: risks.length,
    assumptions: assumptions.length,
    conflicts: conflicts.length,
    agent_personas: personas.length,
  };
  console.log(dryRun ? "Would remove:" : "Removing:", plan);
  if (dryRun) return;

  const del = async (table: string, ids: string[], column = "id") => {
    for (let index = 0; index < ids.length; index += 100) {
      check(
        await supabase.from(table).delete().in(column, ids.slice(index, index + 100)),
        `delete ${table}`,
      );
    }
  };
  await del("answer_runs", runIds); // cascades answer_claims
  await del("claims", claimIds); // cascades claim_evidence
  await del("risk_items", risks.map((row) => row.id)); // cascades risk_evidence
  await del("source_documents", documents.map((row) => row.id)); // cascades locations + evidence
  await del("assumptions", assumptions.map((row) => row.id));
  await del("conflicts", conflicts.map((row) => row.id));
  await del("agent_personas", personas.map((row) => row.id));

  // Profiles are rewritten by the HR master sync; strip the hand-written
  // interview scripts and invented details from any that remain.
  const profiles = check(
    await supabase.from("employee_profiles").select("id, profile"),
    "profiles",
  ) ?? [];
  for (const row of profiles) {
    const profile = (row.profile ?? {}) as Record<string, unknown>;
    if (!("interview" in profile || "assumedDetails" in profile || "groundedFacts" in profile)) continue;
    const rest = Object.fromEntries(
      Object.entries(profile).filter(
        ([name]) => !["interview", "assumedDetails", "groundedFacts"].includes(name),
      ),
    );
    check(
      await supabase.from("employee_profiles").update({ profile: rest }).eq("id", row.id),
      "profile cleanup",
    );
  }
  // Findings saved by the retired keyword fallback carry template text and no
  // observed/inference fields; close them so only generated findings remain.
  const legacy = await supabase
    .from("risk_items")
    .update({ status: "closed" })
    .eq("origin", "analysis")
    .in("status", ["open", "watch"])
    .is("inference", null)
    .select("id");
  if (legacy.error && legacy.error.code !== "42703") throw new Error(legacy.error.message);
  console.log(`Closed ${legacy.data?.length ?? 0} template-text findings.`);
  console.log("Purge complete. Run POST /api/sync, then /api/embed and /api/analyze.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
