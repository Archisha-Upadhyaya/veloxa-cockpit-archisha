import { createClient } from "@supabase/supabase-js";
import { embedTexts } from "../src/lib/rag/embeddings";
import { isSensitiveEvidence } from "../src/lib/evidence/snippet";

const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error(
    "Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SECRET_KEY before embedding.",
  );
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BATCH_SIZE = 16;

async function main() {
  await supabase
    .from("evidence_items")
    .update({ embedding: null })
    .eq("is_sensitive", true)
    .not("embedding", "is", null);

  let embedded = 0;
  for (;;) {
    const { data, error } = await supabase
      .from("evidence_items")
      .select("id, evidence_text")
      .is("embedding", null)
      .eq("is_sensitive", false)
      .order("created_at")
      .limit(BATCH_SIZE);
    if (error) throw new Error(`Loading evidence failed: ${error.message}`);
    if (!data?.length) break;

    const sensitiveIds = data
      .filter((item) => isSensitiveEvidence(item.evidence_text))
      .map((item) => item.id);
    if (sensitiveIds.length > 0) {
      const marked = await supabase
        .from("evidence_items")
        .update({ is_sensitive: true, embedding: null })
        .in("id", sensitiveIds);
      if (marked.error) throw new Error(marked.error.message);
    }
    const safeItems = data.filter(
      (item) => !isSensitiveEvidence(item.evidence_text),
    );
    if (safeItems.length === 0) continue;

    const embeddings = await embedTexts(
      safeItems.map((item) => item.evidence_text),
      "RETRIEVAL_DOCUMENT",
    );
    for (const [index, item] of safeItems.entries()) {
      const result = await supabase
        .from("evidence_items")
        .update({ embedding: embeddings[index] })
        .eq("id", item.id);
      if (result.error) {
        throw new Error(`Saving embedding failed: ${result.error.message}`);
      }
    }
    embedded += safeItems.length;
    console.log(`Embedded ${embedded} evidence items so far…`);
  }
  console.log(`Embedded ${embedded} evidence items.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
