import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadDirectoryResult } from "@/lib/people/directory";

export async function GET() {
  try {
    const { people, changes, warnings } = await loadDirectoryResult(createServerSupabaseClient());
    return Response.json({ people, changes, warnings });
  } catch (error) {
    console.error("Employee directory query failed", error);
    return Response.json({ error: "Unable to load employee profiles." }, { status: 502 });
  }
}
