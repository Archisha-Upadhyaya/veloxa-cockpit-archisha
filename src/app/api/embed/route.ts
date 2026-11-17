import { createServerSupabaseClient } from "@/lib/supabase/server";
import { embedTexts } from "@/lib/rag/embeddings";

const BATCH_SIZE = 8;

export async function POST() {
  const supabase = createServerSupabaseClient();
  const pending = await supabase
    .from("evidence_items")
    .select("id, evidence_text")
    .is("embedding", null)
    .eq("is_sensitive", false)
    .order("created_at")
    .limit(BATCH_SIZE);
  if (pending.error) {
    return Response.json({ error: pending.error.message }, { status: 502 });
  }
  if (!pending.data?.length) {
    return Response.json({ embedded: 0, remaining: 0, complete: true });
  }

  try {
    const vectors = await embedTexts(
      pending.data.map((item) => item.evidence_text),
      "RETRIEVAL_DOCUMENT",
    );
    for (const [index, item] of pending.data.entries()) {
      const saved = await supabase
        .from("evidence_items")
        .update({ embedding: vectors[index] })
        .eq("id", item.id);
      if (saved.error) throw new Error(saved.error.message);
    }
    const remaining = await supabase
      .from("evidence_items")
      .select("id", { count: "exact", head: true })
      .is("embedding", null)
      .eq("is_sensitive", false);
    return Response.json({
      embedded: pending.data.length,
      remaining: remaining.count ?? 0,
      complete: (remaining.count ?? 0) === 0,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Embedding failed.";
    console.error("Evidence embedding failed", error);
    return Response.json(
      { error: message, retryable: true, embedded: 0 },
      { status: 429 },
    );
  }
}
