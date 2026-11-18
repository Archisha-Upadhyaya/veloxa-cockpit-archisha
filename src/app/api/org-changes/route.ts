import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loadDirectoryResult } from "@/lib/people/directory";

const changeInput = z.object({
  scope_type: z.enum(["employee", "department"]),
  scope_key: z.string().min(1).max(80),
  new_manager_key: z.string().max(20).nullable().optional(),
  new_manager_title: z.string().max(120).nullable().optional(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  effective_note: z.string().max(200).nullable().optional(),
  status: z.enum(["tentative", "confirmed", "cancelled"]).default("tentative"),
  source: z.string().max(200).nullable().optional(),
});

/** Every reporting-line change, with whether it is applied today and why not. */
export async function GET() {
  try {
    const { changes, warnings } = await loadDirectoryResult(createServerSupabaseClient());
    return Response.json({ changes, warnings });
  } catch (error) {
    console.error("Org changes query failed", error);
    return Response.json({ error: "Unable to load reporting-line changes." }, { status: 502 });
  }
}

/** Record a planned or confirmed reporting-line change. */
export async function POST(request: Request) {
  const parsed = changeInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid change.", issues: parsed.error.issues }, { status: 400 });
  }
  const supabase = createServerSupabaseClient();
  const saved = await supabase.from("org_changes").insert(parsed.data).select("*").single();
  if (saved.error) {
    console.error("Org change insert failed", saved.error);
    return Response.json({ error: saved.error.message }, { status: 502 });
  }
  return Response.json({ change: saved.data }, { status: 201 });
}
