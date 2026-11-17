import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Person } from "@/lib/types";

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("employee_profiles")
      .select(
        "employee_key, display_name, role_title, department, is_active, profile",
      )
      .eq("is_active", true)
      .order("display_name");

    if (error) {
      console.error("Supabase employee profile query failed", error);
      return Response.json(
        { error: "Unable to load employee profiles." },
        { status: 502 },
      );
    }

    const people = (data ?? []).map((row) => ({
      empId: row.employee_key,
      name: row.display_name,
      title: row.role_title,
      department: row.department,
      ...row.profile,
    })) as Person[];

    return Response.json({ people });
  } catch (error) {
    console.error("Supabase configuration is incomplete", error);
    return Response.json(
      { error: "Supabase is not configured on the server." },
      { status: 503 },
    );
  }
}
