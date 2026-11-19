import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AsOf } from "@/lib/time/as-of";

type Supabase = ReturnType<typeof createServerSupabaseClient>;

/**
 * Which findings were knowable as of a date. Today: any finding with at
 * least one released record. A past day: only findings whose every record
 * had been received by then, so the brief never shows hindsight.
 */
export async function findingsKnownAsOf(supabase: Supabase, riskIds: string[], asOf: AsOf) {
  if (riskIds.length === 0) return new Set<string>();
  const { data, error } = await supabase
    .from("risk_evidence")
    .select("risk_id, evidence_items!inner(available_at)")
    .in("risk_id", riskIds);
  if (error) throw new Error(error.message);
  const cutoff = asOf.at.toISOString();
  const byRisk = new Map<string, string[]>();
  for (const link of (data ?? []) as unknown as Array<{ risk_id: string; evidence_items: { available_at: string } }>) {
    byRisk.set(link.risk_id, [...(byRisk.get(link.risk_id) ?? []), link.evidence_items.available_at]);
  }
  return new Set(
    [...byRisk.entries()]
      .filter(([, dates]) => (asOf.historical ? dates.every((date) => date <= cutoff) : dates.some((date) => date <= cutoff)))
      .map(([id]) => id),
  );
}
