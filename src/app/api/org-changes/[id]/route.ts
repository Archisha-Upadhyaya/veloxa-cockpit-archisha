import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const changeUpdate = z.object({
  new_manager_key: z.string().max(20).nullable().optional(),
  new_manager_title: z.string().max(120).nullable().optional(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  effective_note: z.string().max(200).nullable().optional(),
  status: z.enum(["tentative", "confirmed", "cancelled"]).optional(),
});

/** Confirm, re-date, assign the new manager, or cancel a change. */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const parsed = changeUpdate.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Invalid update.", issues: parsed.error.issues }, { status: 400 });
  }
  const saved = await createServerSupabaseClient()
    .from("org_changes")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (saved.error) return Response.json({ error: saved.error.message }, { status: 502 });
  if (!saved.data) return Response.json({ error: "Change not found." }, { status: 404 });
  return Response.json({ change: saved.data });
}
