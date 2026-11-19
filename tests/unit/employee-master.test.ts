import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseEmployeeMaster } from "@/lib/ingestion/people";

const master = path.join(
  process.cwd(),
  "Veloxa_Hackathon_Release_Packs/Day1_Mon_16Nov/data_room/hr/Employee_Master.xlsx",
);

describe("employee master parsing", () => {
  const records = parseEmployeeMaster(readFileSync(master));

  it("finds the header below the export banner and reads every employee", () => {
    expect(records.length).toBe(19);
    expect(records[0]).toMatchObject({ employeeKey: "VX001", managerKey: null });
  });

  it("keeps the supervisor id for every non-CEO employee, pointing at a real employee", () => {
    const keys = new Set(records.map((record) => record.employeeKey));
    for (const record of records.slice(1)) {
      expect(record.managerKey).toBeTruthy();
      expect(keys.has(record.managerKey!)).toBe(true);
    }
  });

  it("reads status and exit date from the sheet", () => {
    const leaver = records.find((record) => record.exitDate);
    expect(leaver?.status).toMatch(/notice/i);
    expect(leaver?.exitDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

import { parseLeaveRegister } from "@/lib/ingestion/people";

describe("leave register parsing", () => {
  const people = parseEmployeeMaster(readFileSync(master)).map((record) => ({ key: record.employeeKey, name: record.name }));
  const leave = parseLeaveRegister(
    readFileSync(path.join(process.cwd(), "Veloxa_Hackathon_Release_Packs/Day2_Tue_17Nov/data_room/hr/Leave_Register.xlsx")),
    people,
  );

  it("matches short names like 'P. Nair' to the directory", () => {
    expect(leave.get("VX007")?.length).toBe(6); // Priya: 1 casual + 5 half days in Sep
    expect(leave.get("VX014")).toEqual([{ from: "2026-02-09", to: "2026-02-27", days: 15 }]); // Fatima
    // Every row of the register is matched to someone.
    expect([...leave.values()].flat().length).toBe(19);
  });
});
