import { createServerSupabaseClient } from "@/lib/supabase/server";
import { safeFacts } from "@/lib/evidence/snippet";

type Profile = {
  joined?: string;
  location?: string;
  groundedFacts?: string[];
};

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

    // Only the directory-safe subset is sent to the browser. Interview
    // answers, assumptions, and any raw profile material stay server-side.
    const people = (data ?? []).map((row) => {
      const profile = (row.profile ?? {}) as Profile;
      return {
        empId: row.employee_key,
        name: row.display_name,
        title: row.role_title,
        department: row.department,
        joined: profile.joined,
        location: profile.location,
        groundedFacts: safeFacts(profile.groundedFacts ?? [], 6),
      };
    });

    return Response.json({ people });
  } catch (error) {
    console.error("Supabase configuration is incomplete", error);
    return Response.json(
      { error: "The employee directory is not configured on the server." },
      { status: 503 },
    );
  }
}
