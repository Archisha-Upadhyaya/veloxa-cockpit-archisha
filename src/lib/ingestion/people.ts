import { promises as fs } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import type { ParsedFile } from "@/lib/ingestion/files";
import { documentDate } from "@/lib/time/document-date";

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

export type LeavePeriod = { from: string; to: string; days: number | null };

/**
 * Parse a leave register: rows of employee, from, to. The employee column may
 * use short forms ("A. Das"); they are matched to full names by first initial
 * and surname. Leave type is deliberately not kept: the cockpit only needs to
 * know someone was away, not why.
 */
export function parseLeaveRegister(buffer: Buffer, names: Array<{ key: string; name: string }>) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const byKey = new Map<string, LeavePeriod[]>();
  const match = (label: string) => {
    const clean = label.replace(/\./g, " ").replace(/\s+/g, " ").trim().toLowerCase();
    const [first, ...rest] = clean.split(" ");
    const surname = rest.join(" ");
    return names.find((person) => {
      const parts = person.name.toLowerCase().split(/\s+/);
      const personSurname = parts.slice(1).join(" ");
      if (person.name.toLowerCase() === clean) return true;
      return surname && personSurname === surname && parts[0].startsWith(first);
    });
  };
  for (const sheetName of workbook.SheetNames) {
    const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, raw: false, blankrows: false });
    const headerIndex = grid.findIndex((row) => row.some((value) => /^employee$/i.test(String(value ?? "").trim())));
    if (headerIndex < 0) continue;
    const header = grid[headerIndex].map((value) => String(value ?? "").trim().toLowerCase());
    const col = (name: string) => header.findIndex((value) => value === name);
    const [employee, from, to, days] = [col("employee"), col("from"), col("to"), col("days")];
    if (employee < 0 || from < 0) continue;
    for (const row of grid.slice(headerIndex + 1)) {
      const person = match(String(row[employee] ?? ""));
      const start = String(row[from] ?? "").slice(0, 10);
      if (!person || !/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
      const end = String(row[to] ?? "").slice(0, 10);
      const list = byKey.get(person.key) ?? [];
      list.push({ from: start, to: /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : start, days: days >= 0 ? Number(row[days]) || null : null });
      byKey.set(person.key, list);
    }
  }
  return byKey;
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
  const leaveFile = files
    .filter((file) => /leave[_\s-]*register/i.test(path.basename(file.relativePath)))
    .sort((left, right) => right.availableAt.localeCompare(left.availableAt))[0];
  const leave = leaveFile
    ? parseLeaveRegister(
        await fs.readFile(leaveFile.absolutePath),
        records.map((record) => ({ key: record.employeeKey, name: record.name })),
      )
    : new Map<string, LeavePeriod[]>();
  const today = new Date().toISOString().slice(0, 10);

  // CEO-reported status (e.g. a resignation the HR export does not show yet)
  // lives beside the HR fields and must survive every re-sync.
  const existing = await supabase.from("employee_profiles").select("employee_key, profile");
  const reportedBy = new Map(
    (existing.data ?? []).map((row) => [row.employee_key, (row.profile as { reported?: unknown } | null)?.reported]),
  );

  for (const record of records) {
    const left = Boolean(record.exitDate && record.exitDate < today);
    const reported = reportedBy.get(record.employeeKey);
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
          // The HR status as exported, so past dates can show it as it was,
          // and the export date: the status is only known from that day on.
          hrStatus: record.status,
          hrExportedOn: documentDate(master.text) ?? master.releaseDay,
          leave: leave.get(record.employeeKey) ?? [],
          exitDate: record.exitDate,
          managerKey: record.managerKey,
          source: {
            file: master.relativePath,
            row: record.sourceRow,
            availableAt: master.availableAt,
          },
          ...(reported ? { reported } : {}),
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
