import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { isSensitiveEvidence } from "@/lib/evidence/snippet";

type Supabase = ReturnType<typeof createServerSupabaseClient>;

type EvidenceJoin = {
  id: string;
  evidence_text: string;
  source_locations: {
    locator: string;
    source_documents: {
      title: string;
      relative_path: string | null;
      metadata: { tier?: "primary" | "secondary" } | null;
    } | null;
  } | null;
};

/**
 * Every released, non-sensitive record. The released corpus is small enough
 * to analyse whole, so the brief never depends on which chunks a similarity
 * search happened to surface (or on the embedding quota).
 */
export async function loadAnalysisEvidence(supabase: Supabase, asOf: string) {
  const { data, error } = await supabase
    .from("evidence_items")
    .select("id, evidence_text, source_locations(locator, source_documents(title, relative_path, metadata))")
    .eq("is_sensitive", false)
    .lte("available_at", asOf)
    .limit(400);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as EvidenceJoin[])
    .filter((row) => !isSensitiveEvidence(row.evidence_text))
    // CEO voice notes are never evidence, even if an older sync stored them.
    .filter((row) => !/\/T6[a-z]?_/i.test(row.source_locations?.source_documents?.relative_path ?? ""))
    .map((row) => {
      const document = row.source_locations?.source_documents;
      const tier: "primary" | "secondary" =
        document?.metadata?.tier ??
        (document?.relative_path?.includes("/transcripts/") ? "secondary" : "primary");
      return {
        id: row.id,
        text: row.evidence_text,
        source: `${document?.title ?? "Source record"} · ${row.source_locations?.locator ?? ""}`,
        tier,
      };
    });
}

