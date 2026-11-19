import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { profileTable } from "@/lib/ingestion/table-profile";

const pack = (file: string) => path.join(process.cwd(), "Veloxa_Hackathon_Release_Packs/Day3_Wed_18Nov/data_room/engineering", file);

describe("large-table profiles", () => {
  const jira = profileTable(
    XLSX.utils.sheet_to_csv(XLSX.readFile(pack("Jira_Export_ATLAS.xlsx")).Sheets.Issues),
    "Jira_Export_ATLAS.xlsx / Issues",
  )!;

  it("profiles the Jira issues with who owns what and in which state", () => {
    expect(jira).toMatch(/62 rows/);
    // Assignee × Status: PN has 35 issues across Done / To Do / In Progress.
    expect(jira).toMatch(/"Assignee" × "Status": [^\n]*PN \(Done \d+, (To Do|In Progress) \d+/);
    // Story points totalled per assignee and per status.
    expect(jira).toMatch(/Total "Story Points" by "Assignee": [^\n]*PN \d+/);
    expect(jira).toMatch(/Total "Story Points" by "Status": [^\n]*To Do \d+/);
  });

  it("profiles the git log by author and repository", () => {
    const git = profileTable(readFileSync(pack("git_log.csv"), "utf8"), "git_log.csv")!;
    expect(git).toMatch(/1453 rows/);
    expect(git).toMatch(/"author_email" × "repo": [^\n]*priya\.n@veloxa\.in \(atlas-engine 425\)/);
  });
});
