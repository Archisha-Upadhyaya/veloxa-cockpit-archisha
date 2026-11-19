import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const reportInput = z.object({
  status: z.enum(["resigned", "leaving", "on_leave"]),
  expectedExit: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  note: z.string().max(240).nullable().optional(),
  source: z.string().max(120).default("Reported by the CEO"),
});

type Params = { params: Promise<{ employeeKey: string }> };

async function loadProfile(employeeKey: string) {
  const supabase = createServerSupabaseClient();
  const row = await supabase
    .from("employee_profiles")
    .select("id, profile")
    .eq("employee_key", employeeKey)
    .maybeSingle();
  return { supabase, row };
}

/**
 * Record something the CEO has been told that the HR export does not show
 * yet (e.g. "Priya resigned this morning"). Stored beside the HR fields,
 * labelled as reported, kept through re-syncs, and never used as evidence.
 */
export async function POST(request: Request, { params }: Params) {
  const { employeeKey } = await params;
  const parsed = reportInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid status.", issues: parsed.error.issues }, { status: 400 });
  const { supabase, row } = await loadProfile(employeeKey);
  if (row.error) return Response.json({ error: row.error.message }, { status: 502 });
  if (!row.data) return Response.json({ error: "Person not found." }, { status: 404 });
  const reported = { ...parsed.data, reportedOn: new Date().toISOString().slice(0, 10) };
  const saved = await supabase
    .from("employee_profiles")
    .update({ profile: { ...((row.data.profile as object) ?? {}), reported } })
    .eq("id", row.data.id);
  if (saved.error) return Response.json({ error: saved.error.message }, { status: 502 });
  return Response.json({ reported });
}

/** Clear a reported status (e.g. once the HR export reflects it, or it was wrong). */
export async function DELETE(_request: Request, { params }: Params) {
  const { employeeKey } = await params;
  const { supabase, row } = await loadProfile(employeeKey);
  if (row.error) return Response.json({ error: row.error.message }, { status: 502 });
  if (!row.data) return Response.json({ error: "Person not found." }, { status: 404 });
  const profile = { ...((row.data.profile as Record<string, unknown>) ?? {}) };
  delete profile.reported;
  const saved = await supabase.from("employee_profiles").update({ profile }).eq("id", row.data.id);
  if (saved.error) return Response.json({ error: saved.error.message }, { status: 502 });
  return Response.json({ cleared: true });
}
