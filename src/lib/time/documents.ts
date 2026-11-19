import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { friendlySourceTitle } from "@/lib/evidence/snippet";
import { documentDate } from "@/lib/time/document-date";

type Supabase = ReturnType<typeof createServerSupabaseClient>;

export type DatedDocument = {
  id: string;
  title: string;
  source_type: string;
  release_day: string | null;
  available_at: string;
  /** Date the document itself carries, or null. */
  documentDate: string | null;
  /** documentDate, or the day it entered the system when it has none. */
  effectiveDate: string;
  dateIsFromDocument: boolean;
};

/** Released documents as of a moment, each with its own date. */
export async function loadDocuments(supabase: Supabase, asOf: Date): Promise<DatedDocument[]> {
  const { data, error } = await supabase
    .from("source_documents")
    .select("id, title, source_type, release_day, available_at, metadata, source_locations(locator, quoted_text)")
    .lte("available_at", asOf.toISOString())
    .eq("source_locations.locator", "chunk-1")
    .order("available_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<{
    id: string;
    title: string;
    source_type: string;
    release_day: string | null;
    available_at: string;
    metadata: { sensitive?: boolean } | null;
    source_locations: Array<{ locator: string; quoted_text: string }> | null;
  }>).map((document) => {
    const head = document.metadata?.sensitive ? "" : document.source_locations?.[0]?.quoted_text ?? "";
    const own = head ? documentDate(head, document.source_type) : null;
    // Never show a document date later than when we received it.
    const fromDocument = own && own <= document.available_at.slice(0, 10) ? own : null;
    return {
      id: document.id,
      title: friendlySourceTitle(document.title),
      source_type: document.source_type,
      release_day: document.release_day,
      available_at: document.available_at,
      documentDate: fromDocument,
      effectiveDate: fromDocument ?? document.release_day ?? document.available_at.slice(0, 10),
      dateIsFromDocument: Boolean(fromDocument),
    };
  });
}
