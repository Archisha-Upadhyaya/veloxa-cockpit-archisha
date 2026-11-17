import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readDataRoom, splitEvidence } from "@/lib/ingestion/files";

export async function POST() {
  const supabase = createServerSupabaseClient();
  const run = await supabase.from("ingestion_runs").insert({ status: "running" }).select("id").single();
  if (run.error) return Response.json({ error: run.error.message }, { status: 502 });

  try {
    const files = await readDataRoom();
    const allowedPaths = new Set(files.map((file) => file.relativePath));
    const existingDocuments = await supabase
      .from("source_documents")
      .select("id, relative_path");
    if (existingDocuments.error) throw new Error(existingDocuments.error.message);
    const staleIds = (existingDocuments.data ?? [])
      .filter((document) => !document.relative_path || !allowedPaths.has(document.relative_path))
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
      const existing = await supabase.from("source_documents").select("id, content_hash, ingestion_status").eq("relative_path", file.relativePath).maybeSingle();
      if (existing.error) throw new Error(existing.error.message);
      if (existing.data?.content_hash === file.contentHash) {
        if (existing.data.ingestion_status === "pending") {
          await supabase
            .from("source_documents")
            .update({ ingestion_status: "ready", release_day: file.releaseDay })
            .eq("id", existing.data.id);
        } else {
          await supabase
            .from("source_documents")
            .update({ release_day: file.releaseDay })
            .eq("id", existing.data.id);
        }
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
        metadata: { origin: "Veloxa_Hackathon_Release_Packs" },
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
        }))).select("id");
        if (items.error) throw new Error(items.error.message);
      }
      await supabase.from("source_documents").update({ ingestion_status: "ready" }).eq("id", document.data.id);
    }
    await supabase.from("ingestion_runs").update({
      status: "completed", completed_at: new Date().toISOString(), files_seen: files.length,
      files_changed: changed, chunks_created: chunksCreated, embeddings_created: 0,
    }).eq("id", run.data.id);
    return Response.json({ run_id: run.data.id, files_seen: files.length, files_changed: changed, chunks_created: chunksCreated, embeddings_pending: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingestion failed.";
    await supabase.from("ingestion_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: message }).eq("id", run.data.id);
    console.error("Data-room sync failed", error);
    return Response.json({ error: message, run_id: run.data.id }, { status: 502 });
  }
}
