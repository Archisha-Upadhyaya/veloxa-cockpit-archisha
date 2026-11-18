import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEmployeeMaster } from "@/lib/ingestion/people";
import { buildDirectory, type OrgChange, type ProfileRow } from "@/lib/people/directory";

const records = parseEmployeeMaster(
  readFileSync(path.join(process.cwd(), "Veloxa_Hackathon_Release_Packs/Day1_Mon_16Nov/data_room/hr/Employee_Master.xlsx")),
);
const baseRows: ProfileRow[] = records.map((record) => ({
  employee_key: record.employeeKey,
  display_name: record.name,
  role_title: record.title,
  department: record.department,
  is_active: true,
  profile: { managerKey: record.managerKey },
}));
const cro: ProfileRow = {
  employee_key: "VX020",
  display_name: "New CRO",
  role_title: "Chief Revenue Officer",
  department: "Leadership",
  is_active: true,
  profile: { managerKey: "VX001" },
};
const marketingToCro = (overrides: Partial<OrgChange> = {}): OrgChange => ({
  id: "c1",
  scope_type: "department",
  scope_key: "Marketing",
  new_manager_key: null,
  new_manager_title: "Chief Revenue Officer (to be appointed)",
  effective_from: null,
  effective_note: "next month or the month after; not finalised",
  status: "tentative",
  source: "CEO voice note",
  ...overrides,
});
const asOf = new Date("2026-11-18T12:00:00Z");
const find = (people: ReturnType<typeof buildDirectory>["people"], name: string) =>
  people.find((person) => person.name === name)!;

describe("reporting-line changes", () => {
  it("keeps the HR master line while the CRO move is tentative, and says why", () => {
    const { people, changes } = buildDirectory(baseRows, [], [marketingToCro()], asOf);
    expect(find(people, "Nikhil Bose").managerName).toBe("Ananya Rao");
    expect(changes[0].applied).toBe(false);
    expect(changes[0].reason).toMatch(/not confirmed/i);
    expect(find(people, "Nikhil Bose").pendingChanges[0].to).toMatch(/Chief Revenue Officer/);
  });

  it("does not apply a confirmed move before its date or before the CRO exists", () => {
    const early = buildDirectory([...baseRows, cro], [], [marketingToCro({ status: "confirmed", new_manager_key: "VX020", effective_from: "2026-12-01" })], asOf);
    expect(early.changes[0].reason).toMatch(/2026-12-01/);
    const noCro = buildDirectory(baseRows, [], [marketingToCro({ status: "confirmed", effective_from: "2026-11-01" })], asOf);
    expect(noCro.changes[0].reason).toMatch(/not in the directory/i);
    expect(find(noCro.people, "Nikhil Bose").managerName).toBe("Ananya Rao");
  });

  it("moves the whole department under the CRO once confirmed and effective", () => {
    const { people, changes } = buildDirectory(
      [...baseRows, cro],
      [],
      [marketingToCro({ status: "confirmed", new_manager_key: "VX020", effective_from: "2026-11-01" })],
      asOf,
    );
    expect(changes[0].applied).toBe(true);
    expect(find(people, "Nikhil Bose").managerName).toBe("New CRO");
    // The team stays with Nikhil, one level deeper.
    expect(find(people, "Aisha Khan").managerName).toBe("Nikhil Bose");
    expect(find(people, "Aisha Khan").chain).toEqual(["Ananya Rao", "New CRO", "Nikhil Bose"]);
    expect(find(people, "New CRO").reports.map((report) => report.name)).toContain("Nikhil Bose");
    // The CEO is still the single top of the tree, and nobody is lost.
    expect(people.filter((person) => person.level === 0).map((person) => person.name)).toEqual(["Ananya Rao"]);
    expect(people).toHaveLength(20);
  });

  it("refuses a change that would create a loop, and nobody disappears", () => {
    const loop: OrgChange = { ...marketingToCro(), scope_type: "employee", scope_key: "VX001", new_manager_key: "VX011", status: "confirmed", effective_from: "2026-11-01" };
    const { people, changes, warnings } = buildDirectory(baseRows, [], [loop], asOf);
    expect(changes[0].applied).toBe(false);
    expect(warnings.join(" ")).toMatch(/loop/);
    expect(people).toHaveLength(19);
    expect(find(people, "Ananya Rao").level).toBe(0);
  });

  it("survives a loop already present in the source data", () => {
    const broken = baseRows.map((row) =>
      row.employee_key === "VX001" ? { ...row, profile: { managerKey: "VX004" } } : row,
    );
    const { people, warnings } = buildDirectory(broken, [], [], asOf);
    expect(people).toHaveLength(19);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("chat personas", () => {
  const doc = (title: string, text: string) => ({
    evidence_text: text,
    available_at: "2026-11-16T00:00:00Z",
    source_locations: { locator: "chunk-1", source_documents: { title, release_day: null, relative_path: `Day1/${title}` } },
  });
  // Everyone appears once, except Divya, Aisha and Kavya, who do not appear at all.
  const evidence = baseRows
    .filter((row) => !["VX008", "VX011", "VX019"].includes(row.employee_key))
    .map((row) => doc(`${row.employee_key}.eml`, `Note about ${row.display_name}.`));

  it("selects 14 personas, never the CEO, dropping the least present", () => {
    const { people } = buildDirectory(baseRows, evidence, [], asOf);
    const personas = people.filter((person) => person.isPersona).map((person) => person.name);
    expect(personas).toHaveLength(14);
    expect(personas).not.toContain("Ananya Rao");
    for (const name of ["Divya Reddy", "Aisha Khan", "Kavya Narayan"]) expect(personas).not.toContain(name);
  });

  it("does not count CEO voice notes or the HR master as presence", () => {
    const voiceNote = doc("T6b_CEO_Voice_Note.docx", "Divya Reddy Aisha Khan Kavya Narayan");
    const master = { ...doc("Employee_Master.xlsx", "Divya Reddy Aisha Khan Kavya Narayan") };
    voiceNote.source_locations.source_documents.relative_path = "Day3/transcripts/T6b_CEO_Voice_Note.docx";
    const { people } = buildDirectory(baseRows, [...evidence, voiceNote, master], [], asOf);
    expect(people.find((person) => person.name === "Divya Reddy")!.presence.documents).toBe(0);
  });

  it("never makes someone who has left a persona", () => {
    const rows = baseRows.map((row) => (row.employee_key === "VX013" ? { ...row, is_active: false } : row));
    const { people } = buildDirectory(rows, evidence, [], asOf);
    expect(people.find((person) => person.name === "Siddharth Mehta")!.isPersona).toBe(false);
    expect(people.filter((person) => person.isPersona)).toHaveLength(14);
  });
});
