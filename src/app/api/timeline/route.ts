import { createServerSupabaseClient } from "@/lib/supabase/server";
import { friendlySourceTitle } from "@/lib/evidence/snippet";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const asOf = new Date().toISOString();
    const { data, error } = await supabase
      .from("source_documents")
      .select("id, title, source_type, release_day, available_at, metadata")
      .lte("available_at", asOf)
      .order("available_at", { ascending: false });

    if (error) throw new Error(error.message);
    return Response.json({
      sources: (data ?? []).map((source) => ({
        ...source,
        title: friendlySourceTitle(source.title),
      })),
    });
  } catch (error) {
    console.error("Timeline data query failed", error);
    return Response.json(
      { error: "Unable to load the evidence timeline." },
      { status: 502 },
    );
  }
}
