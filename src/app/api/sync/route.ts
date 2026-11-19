import { after } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { POST as embed } from "@/app/api/embed/route";
import { POST as analyze } from "@/app/api/analyze/route";
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
    // New or changed documents: embed them and rebuild the brief in the
    // background, so the CEO never sees a brief older than the documents.
    if (changed > 0) {
      after(async () => {
        try {
          for (let batch = 0; batch < 60; batch += 1) {
            const body = await (await embed()).json();
            if (body.complete || body.error) break;
          }
          await analyze();
          console.info(`Sync: ${changed} changed files embedded and analysed.`);
        } catch (error) {
          console.error("Sync follow-up (embed/analyze) failed", error);
        }
      });
    }
    return Response.json({
      reanalysing: changed > 0,
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
