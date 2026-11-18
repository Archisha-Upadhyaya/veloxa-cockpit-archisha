/**
 * Sync only the people directory (names, titles, departments, Manager ID →
 * reporting line, status) from the latest released Employee_Master.xlsx.
 * Documents, evidence and concerns are not touched.
 */
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readDataRoom } from "@/lib/ingestion/files";
import { syncEmployees } from "@/lib/ingestion/people";

async function main() {
  const supabase = createServerSupabaseClient();
  const result = await syncEmployees(supabase, await readDataRoom());
  console.log("Employee sync:", result);
  const { data, error } = await supabase
    .from("employee_profiles")
    .select("employee_key, display_name, profile")
    .order("employee_key");
  if (error) throw new Error(error.message);
  const names = new Map((data ?? []).map((row) => [row.employee_key, row.display_name]));
  for (const row of data ?? []) {
    const manager = (row.profile as { managerKey?: string | null } | null)?.managerKey;
    console.log(`  ${row.employee_key} ${row.display_name} → ${manager ? `${names.get(manager) ?? manager} (${manager})` : "top of company"}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
