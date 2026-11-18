import { createServerSupabaseClient } from "@/lib/supabase/server";
import { syncDataRoom } from "@/lib/ingestion/sync";
import { syncEmployees } from "@/lib/ingestion/people";

export async function POST() {
  const supabase = createServerSupabaseClient();
  const run = await supabase.from("ingestion_runs").insert({ status: "running" }).select("id").single();
  if (run.error) return Response.json({ error: run.error.message }, { status: 502 });

  try {
    const { files, changed, chunksCreated } = await syncDataRoom(supabase);
    const employees = await syncEmployees(supabase, files);
    await supabase.from("ingestion_runs").update({
      status: "completed", completed_at: new Date().toISOString(), files_seen: files.length,
      files_changed: changed, chunks_created: chunksCreated, embeddings_created: 0,
    }).eq("id", run.data.id);
    return Response.json({
      run_id: run.data.id,
      files_seen: files.length,
      files_changed: changed,
      chunks_created: chunksCreated,
      employees,
      embeddings_pending: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingestion failed.";
    await supabase.from("ingestion_runs").update({ status: "failed", completed_at: new Date().toISOString(), error_message: message }).eq("id", run.data.id);
    console.error("Data-room sync failed", error);
    return Response.json({ error: message, run_id: run.data.id }, { status: 502 });
  }
}
