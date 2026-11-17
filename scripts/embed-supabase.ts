import { createClient } from "@supabase/supabase-js";
import { embedTexts } from "../src/lib/rag/embeddings";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  throw new Error(
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY before embedding.",
  );
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data, error } = await supabase
    .from("evidence_items")
    .select("id, evidence_text")
    .is("embedding", null)
    .eq("is_sensitive", false)
    .order("created_at");
  if (error) throw new Error(`Loading evidence failed: ${error.message}`);
  if (!data?.length) {
    console.log("No unembedded non-sensitive evidence items found.");
    return;
  }

  const embeddings = await embedTexts(
    data.map((item) => item.evidence_text),
    "RETRIEVAL_DOCUMENT",
  );
  for (const [index, item] of data.entries()) {
    const result = await supabase
      .from("evidence_items")
      .update({ embedding: embeddings[index] })
      .eq("id", item.id);
    if (result.error) {
      throw new Error(`Saving embedding failed: ${result.error.message}`);
    }
  }
  console.log(`Embedded ${data.length} evidence items.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
