import * as XLSX from "xlsx";

/** Tables with more data rows than this get a profile chunk. */
export const PROFILE_MIN_ROWS = 60;

const MONTH = /^(\d{4})-(\d{2})/;

/**
 * A generic, readable profile of a large table: size, date span, monthly
 * volume, and for each low-cardinality column its counts per month. Nothing
 * here knows which file it is reading; the same profile works for a git log,
 * a ticket export or a ledger.
 */
export function profileTable(csv: string, label: string): string | null {
  const grid = XLSX.utils.sheet_to_json<string[]>(XLSX.read(csv, { type: "string", raw: true }).Sheets.Sheet1, {
    header: 1,
    raw: false,
    blankrows: false,
  });
  // Header = first row whose cells are mostly non-empty.
  const headerIndex = grid.findIndex((row) => row.filter((cell) => String(cell ?? "").trim()).length >= Math.max(2, row.length * 0.6));
  if (headerIndex < 0) return null;
  const header = grid[headerIndex].map((cell) => String(cell ?? "").trim());
  const rows = grid.slice(headerIndex + 1).filter((row) => row.some((cell) => String(cell ?? "").trim()));
  if (rows.length < PROFILE_MIN_ROWS) return null;

  const column = (index: number) => rows.map((row) => String(row[index] ?? "").trim());
  const dateIndex = header.findIndex((_, index) => {
    const values = column(index).slice(0, 50);
    return values.filter((value) => MONTH.test(value)).length > values.length * 0.8;
  });
  const monthOf = (row: string[]) => (dateIndex >= 0 ? String(row[dateIndex] ?? "").match(MONTH)?.slice(1, 3).join("-") ?? null : null);
  const months = dateIndex >= 0 ? [...new Set(rows.map(monthOf).filter((month): month is string => Boolean(month)))].sort() : [];

  const lines = [`Table profile: ${label}`, `${rows.length} rows. Columns: ${header.join(", ")}.`];
  if (months.length) {
    const perMonth = months.map((month) => `${month}: ${rows.filter((row) => monthOf(row) === month).length}`);
    lines.push(`Date range ${months[0]} to ${months.at(-1)} (column "${header[dateIndex]}"). Rows per month: ${perMonth.join(", ")}.`);
  }

  header.forEach((name, index) => {
    if (index === dateIndex) return;
    const values = column(index);
    const distinct = new Map<string, number>();
    for (const value of values) if (value) distinct.set(value, (distinct.get(value) ?? 0) + 1);
    // Only grouping columns (people, teams, services, statuses): skip numbers,
    // free text and identifiers.
    if (distinct.size < 2 || distinct.size > 10) return;
    if ([...distinct.keys()].every((value) => /^-?\d+(\.\d+)?$/.test(value))) return;
    const top = [...distinct.entries()].sort((a, b) => b[1] - a[1]);
    lines.push(`"${name}" counts: ${top.map(([value, count]) => `${value} ${count}`).join(", ")}.`);
    if (months.length > 1) {
      for (const [value] of top.slice(0, 10)) {
        const series = months.map((month) => rows.filter((row) => monthOf(row) === month && String(row[index] ?? "").trim() === value).length);
        lines.push(`  ${value} by month: ${months.map((month, position) => `${month} ${series[position]}`).join(", ")}.`);
      }
    }
  });
  return lines.join("\n");
}
