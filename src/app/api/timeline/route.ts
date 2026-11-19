import { createServerSupabaseClient } from "@/lib/supabase/server";
import { asOfFromRequest } from "@/lib/time/as-of";
import { loadDocuments } from "@/lib/time/documents";

export async function GET(request: Request) {
  try {
    const asOf = asOfFromRequest(request);
    const sources = await loadDocuments(createServerSupabaseClient(), asOf.at);
    // Newest by the document's own date first.
    sources.sort((left, right) => right.effectiveDate.localeCompare(left.effectiveDate));
    return Response.json({ asOf: asOf.day, sources });
  } catch (error) {
    console.error("Timeline data query failed", error);
    return Response.json({ error: "Unable to load the documents." }, { status: 502 });
  }
}
