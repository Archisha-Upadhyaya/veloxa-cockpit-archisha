import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { RetrievedEvidence } from "@/lib/rag/retrieve";

type Supabase = ReturnType<typeof createServerSupabaseClient>;

const STOP = new Set([
  "the", "and", "for", "with", "that", "this", "what", "when", "where", "which",
  "who", "how", "why", "are", "was", "were", "has", "have", "had", "does", "did",
  "about", "from", "into", "your", "our", "you", "any", "there", "their", "will",
  "would", "could", "should", "tell", "show", "give", "need", "know",
]);

export function keywordTerms(query: string, max = 5) {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9₹]+/)
    .filter((word) => word.length > 2 && !STOP.has(word));
  return [...new Set(words)].sort((a, b) => b.length - a.length).slice(0, max);
}

type EvidenceJoinRow = {
  id: string;
  evidence_text: string;
  available_at: string;
  source_locations: {
    locator: string;
    quoted_text?: string | null;
    source_documents: { id: string; title: string; source_type: string } | null;
  } | null;
};

/**
 * Stored-data fallback for semantic retrieval. When the embedding provider or
 * the vector RPC is unavailable, search the stored evidence text directly and
 * rank by how many query terms each record contains.
 */
export async function keywordEvidenceSearch(
  supabase: Supabase,
  query: string,
  options: { asOf?: string; limit?: number } = {},
): Promise<RetrievedEvidence[]> {
  const terms = keywordTerms(query);
  if (terms.length === 0) return [];
  const filter = terms
    .map((term) => `evidence_text.ilike.%${term.replace(/[%,()]/g, "")}%`)
    .join(",");
  const { data, error } = await supabase
    .from("evidence_items")
    .select(
      "id, evidence_text, available_at, source_locations(locator, quoted_text, source_documents(id, title, source_type))",
    )
    .eq("is_sensitive", false)
    .lte("available_at", options.asOf ?? new Date().toISOString())
    .or(filter)
    .limit(60);
  if (error) throw new Error(`Keyword evidence search failed: ${error.message}`);
  const rows = (data ?? []) as unknown as EvidenceJoinRow[];
  return rows
    .map((row) => {
      const text = row.evidence_text.toLowerCase();
      const hits = terms.filter((term) => text.includes(term)).length;
      return {
        evidence_id: row.id,
        evidence_text: row.evidence_text,
        similarity: hits / terms.length,
        source_document_id: row.source_locations?.source_documents?.id ?? "",
        source_title: row.source_locations?.source_documents?.title ?? "Source record",
        source_type: row.source_locations?.source_documents?.source_type ?? "",
        locator: row.source_locations?.locator ?? "",
        quoted_text: row.source_locations?.quoted_text ?? "",
        available_at: row.available_at,
      };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, options.limit ?? 8);
}

const NARRATIVE_COLUMNS = ["observed", "inference", "recommended_action", "polarity", "area", "owner_employee_key"];

/**
 * Select from risk_items, retrying without the narrative columns when the
 * database has not had the concern_narrative migration yet. Stored concerns
 * are always returned; only the newer fields go missing.
 */
export async function selectRiskItems<T>(
  columns: string,
  build: (select: string) => PromiseLike<{ data: T | null; error: { code?: string; message: string } | null }>,
) {
  const first = await build(columns);
  if (first.error?.code !== "42703") return first;
  const legacy = columns
    .split(",")
    .map((column) => column.trim())
    .filter((column) => !NARRATIVE_COLUMNS.includes(column))
    .join(", ");
  console.warn("risk_items narrative columns missing; apply 20261118000000_concern_narrative.sql");
  return build(legacy);
}
