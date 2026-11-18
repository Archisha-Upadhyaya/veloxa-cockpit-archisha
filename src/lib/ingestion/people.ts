import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ParsedFile } from "@/lib/ingestion/files";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

export type EmployeeRecord = {
  employeeKey: string;
  name: string;
  email: string | null;
  department: string;
  title: string;
  managerKey: string | null;
  joined: string | null;
  location: string | null;
  status: string;
  exitDate: string | null;
  sourceRow: number;
};

function cell(row: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    const key = Object.keys(row).find(
      (candidate) => candidate.trim().toLowerCase() === name.toLowerCase(),
    );
    const value = key ? row[key] : undefined;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value).trim();
    }
  }
  return null;
}

/**
 * Parse an HR master export. The header row is located by its "Emp ID"
 * column rather than a fixed offset, because exports carry a title banner.
 */
export function parseEmployeeMaster(buffer: Buffer): EmployeeRecord[] {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const records: EmployeeRecord[] = [];
  for (const sheetName of workbook.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      blankrows: false,
    });
    const headerIndex = grid.findIndex((row) =>
      row.some((value) => /^emp(loyee)?\s*id$/i.test(String(value ?? "").trim())),
    );
    if (headerIndex < 0) continue;
    const header = grid[headerIndex].map((value) => String(value ?? "").trim());
    for (let index = headerIndex + 1; index < grid.length; index += 1) {
      const row = Object.fromEntries(header.map((name, column) => [name, grid[index][column]]));
      const employeeKey = cell(row, "Emp ID", "Employee ID");
      const name = cell(row, "Full Name", "Name");
      if (!employeeKey || !name) continue;
      records.push({
        employeeKey,
        name,
        email: cell(row, "Work Email", "Email"),
        department: cell(row, "Department") ?? "Unassigned",
        title: cell(row, "Title", "Designation") ?? "",
        managerKey: cell(row, "Manager ID", "Reports To", "Supervisor ID"),
        joined: cell(row, "Join Date", "Joined"),
        location: cell(row, "Location"),
        status: cell(row, "Status") ?? "Active",
        exitDate: cell(row, "Exit Date"),
        // 1-based spreadsheet row, for traceability back to the source.
        sourceRow: index + 1,
      });
    }
  }
  return records;
}

export function findEmployeeMaster(files: ParsedFile[]) {
  return files
    .filter((file) => /employee[_\s-]*master/i.test(path.basename(file.relativePath)))
    .sort((left, right) => right.availableAt.localeCompare(left.availableAt))[0];
}

/**
 * Upsert the directory from the most recent released HR master. The profile
 * holds only values read from that file; anything previously stored in the
 * profile (including legacy hand-written content) is replaced.
 */
export async function syncEmployees(supabase: SupabaseClient, files: ParsedFile[]) {
  const master = findEmployeeMaster(files);
  if (!master) return { source: null, upserted: 0, deactivated: 0 };
  const records = parseEmployeeMaster(await fs.readFile(master.absolutePath));
  const today = new Date().toISOString().slice(0, 10);

  for (const record of records) {
    const left = Boolean(record.exitDate && record.exitDate < today);
    const saved = await supabase.from("employee_profiles").upsert(
      {
        employee_key: record.employeeKey,
        display_name: record.name,
        role_title: record.title,
        department: record.department,
        is_active: !left,
        profile: {
          email: record.email,
          joined: record.joined,
          location: record.location,
          status: left ? "Exited" : record.status,
          exitDate: record.exitDate,
          managerKey: record.managerKey,
          source: {
            file: master.relativePath,
            row: record.sourceRow,
            availableAt: master.availableAt,
          },
        },
      },
      { onConflict: "employee_key" },
    );
    if (saved.error) throw new Error(`Employee ${record.employeeKey}: ${saved.error.message}`);
  }

  // Anyone not in the HR master has no source record behind them.
  const keys = records.map((record) => record.employeeKey);
  const stale = await supabase
    .from("employee_profiles")
    .update({ is_active: false })
    .not("employee_key", "in", `(${keys.map((key) => `"${key}"`).join(",")})`)
    .select("employee_key");
  if (stale.error) throw new Error(stale.error.message);
  return { source: master.relativePath, upserted: records.length, deactivated: stale.data?.length ?? 0 };
}
