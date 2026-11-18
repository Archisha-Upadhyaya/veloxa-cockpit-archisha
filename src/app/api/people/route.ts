import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadDirectory } from "@/lib/people/directory";

export async function GET() {
  try {
    const people = await loadDirectory(createServerSupabaseClient());
    return Response.json({ people });
  } catch (error) {
    console.error("Employee directory query failed", error);
    return Response.json({ error: "Unable to load employee profiles." }, { status: 502 });
  }
}
