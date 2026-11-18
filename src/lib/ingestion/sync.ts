import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { readDataRoom, splitEvidence } from "@/lib/ingestion/files";
import { isSensitiveEvidence } from "@/lib/evidence/snippet";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

async function markDocumentEvidenceSensitive(
  supabase: SupabaseClient,
  documentId: string,
  sensitive: boolean,
) {
  if (!sensitive) return;
  const locations = await supabase
    .from("source_locations")
    .select("id")
    .eq("source_document_id", documentId);
  if (locations.error) throw new Error(locations.error.message);
  const locationIds = (locations.data ?? []).map((location) => location.id);
  if (locationIds.length === 0) return;
  const updated = await supabase
    .from("evidence_items")
    .update({ is_sensitive: true, embedding: null })
    .in("source_location_id", locationIds);
  if (updated.error) throw new Error(updated.error.message);
}

/**
 * Ingest every released file in the data room into source documents,
 * locations and evidence items. Unchanged files are skipped by content hash.
 */
export async function syncDataRoom(supabase: SupabaseClient) {
  const files = await readDataRoom();
  const allowedPaths = new Set(files.map((file) => file.relativePath));
  const existingDocuments = await supabase
    .from("source_documents")
    .select("id, relative_path");
  if (existingDocuments.error) throw new Error(existingDocuments.error.message);
  // Only remove documents that were ingested from a known relative path and
  // are no longer present. Seeded/curated rows have a null relative_path and
  // must never be deleted by a data-room sync.
  const staleIds = (existingDocuments.data ?? [])
    .filter(
      (document) =>
        document.relative_path && !allowedPaths.has(document.relative_path),
    )
    .map((document) => document.id);
  if (staleIds.length > 0) {
    const removed = await supabase
      .from("source_documents")
      .delete()
      .in("id", staleIds);
    if (removed.error) throw new Error(removed.error.message);
  }
  let changed = 0;
  let chunksCreated = 0;
  for (const file of files) {
    const existing = await supabase
      .from("source_documents")
      .select("id, content_hash, ingestion_status")
      .eq("relative_path", file.relativePath)
      .maybeSingle();
    if (existing.error) throw new Error(existing.error.message);
    if (existing.data?.content_hash === file.contentHash) {
      await supabase
        .from("source_documents")
        .update({
          ingestion_status: "ready",
          release_day: file.releaseDay,
          available_at: file.availableAt,
          metadata: {
            origin: "Veloxa_Hackathon_Release_Packs",
            sensitive: file.sensitive,
            tier: file.tier,
          },
        })
        .eq("id", existing.data.id);
      await markDocumentEvidenceSensitive(
        supabase,
        existing.data.id,
        file.sensitive,
      );
      continue;
    }
    changed += 1;
    const document = await supabase.from("source_documents").upsert({
      external_key: `data-room:${file.relativePath}`,
      relative_path: file.relativePath,
      title: file.title,
      source_type: file.sourceType,
      available_at: file.availableAt,
      release_day: file.releaseDay,
      content_hash: file.contentHash,
      ingestion_status: "pending",
      metadata: {
        origin: "Veloxa_Hackathon_Release_Packs",
        sensitive: file.sensitive,
        tier: file.tier,
      },
    }, { onConflict: "relative_path" }).select("id").single();
    if (document.error) throw new Error(document.error.message);
    await supabase.from("source_locations").delete().eq("source_document_id", document.data.id);
    const evidence = splitEvidence(file.text);
    chunksCreated += evidence.length;
    for (let index = 0; index < evidence.length; index += 50) {
      const batch = evidence.slice(index, index + 50);
      const locations = await supabase.from("source_locations").insert(batch.map((text, offset) => ({
        source_document_id: document.data.id,
        locator: `chunk-${index + offset + 1}`,
        quoted_text: text,
      }))).select("id, quoted_text");
      if (locations.error) throw new Error(locations.error.message);
      const items = await supabase.from("evidence_items").insert(locations.data.map((location) => ({
        source_location_id: location.id,
        evidence_text: location.quoted_text,
        available_at: file.availableAt,
        is_sensitive: file.sensitive || isSensitiveEvidence(location.quoted_text),
      }))).select("id");
      if (items.error) throw new Error(items.error.message);
    }
    await supabase.from("source_documents").update({ ingestion_status: "ready" }).eq("id", document.data.id);
  }
  return { files, changed, chunksCreated };
}
