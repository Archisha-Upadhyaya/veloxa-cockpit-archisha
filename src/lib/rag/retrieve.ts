import { createServerSupabaseClient } from "@/lib/supabase/server";
import { defaultMatchThreshold } from "@/lib/rag/embeddings";

export type RetrievedEvidence = {
  evidence_id: string;
  evidence_text: string;
  similarity: number;
  source_document_id: string;
  source_title: string;
  source_type: string;
  locator: string;
  quoted_text: string;
  available_at: string;
};

export async function retrieveEvidence(
  queryEmbedding: number[],
  options?: { threshold?: number; limit?: number; asOf?: string },
) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.rpc("match_evidence", {
    query_embedding: queryEmbedding,
    match_threshold: options?.threshold ?? defaultMatchThreshold(),
    match_count: options?.limit ?? 8,
    as_of: options?.asOf ?? new Date().toISOString(),
  });

  if (error) throw new Error(`Evidence retrieval failed: ${error.message}`);
  return (data ?? []) as RetrievedEvidence[];
}
