import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadDirectoryResult } from "@/lib/people/directory";
import { asOfFromRequest } from "@/lib/time/as-of";

export async function GET(request: Request) {
  try {
    const asOf = asOfFromRequest(request);
    const { people, changes, warnings } = await loadDirectoryResult(createServerSupabaseClient(), asOf.at);
    return Response.json({ asOf: asOf.day, historical: asOf.historical, people, changes, warnings });
  } catch (error) {
    console.error("Employee directory query failed", error);
    return Response.json({ error: "Unable to load employee profiles." }, { status: 502 });
  }
}
