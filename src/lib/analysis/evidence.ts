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
const MAX_CHUNKS_PER_DOCUMENT = 3;

function chunkNumber(locator?: string | null) {
  const match = locator?.match(/chunk-(\d+)/i);
  return match ? Number(match[1]) : null;
}

export async function loadAnalysisEvidence(supabase: Supabase, asOf: string) {
  const { data, error } = await supabase
    .from("evidence_items")
    .select("id, evidence_text, source_locations(locator, source_documents(title, relative_path, metadata))")
    .eq("is_sensitive", false)
    .lte("available_at", asOf)
    .limit(2000);
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as EvidenceJoin[])
    .filter((row) => !isSensitiveEvidence(row.evidence_text))
    // CEO voice notes are never evidence, even if an older sync stored them.
    .filter((row) => !/\/T6[a-z]?_/i.test(row.source_locations?.source_documents?.relative_path ?? ""))
    // Long documents (large tables) contribute only their first chunks; the
    // first chunk of a large table is its generated profile.
    .filter((row) => (chunkNumber(row.source_locations?.locator) ?? 1) <= MAX_CHUNKS_PER_DOCUMENT)
    .map((row) => {
      const document = row.source_locations?.source_documents;
      const tier: "primary" | "secondary" =
        document?.metadata?.tier ??
        (document?.relative_path?.includes("/transcripts/") ? "secondary" : "primary");
      return {
        id: row.id,
        text: row.evidence_text,
        source: `${document?.title ?? "Source record"} · ${row.source_locations?.locator ?? ""}`,
        // Folder inside the release pack (engineering, finance, hr, email,
        // documents, transcripts): used to analyse the corpus in batches.
        group: document?.relative_path?.split("/").slice(-2, -1)[0] ?? "other",
        tier,
      };
    });
}

