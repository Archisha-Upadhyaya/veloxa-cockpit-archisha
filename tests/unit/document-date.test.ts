import { describe, expect, it } from "vitest";
import { documentDate } from "@/lib/time/document-date";

describe("document dates come from the document itself", () => {
  it("reads email Date headers", () => {
    expect(documentDate("From: Priya\nSubject: time this week?\nDate: Tue, 01 Sep 2026 23:47:00 +0530\n\nCan we talk")).toBe("2026-09-01");
  });
  it("reads export and sent phrases", () => {
    expect(documentDate('"Keka HRMS export, employees only. Exported 31-Oct-2026."')).toBe("2026-10-31");
    expect(documentDate("Board update Jul–Sep 2026, sent 6 Oct 2026")).toBe("2026-10-06");
  });
  it("returns null when the document has no date", () => {
    expect(documentDate("T5 · VP Engineering call\n\nAuto-generated summary by MeetNotes AI.")).toBeNull();
  });
});

describe("tables", () => {
  it("does not mistake a row's date for the document's date", () => {
    expect(documentDate("On-call rota (team wiki table, copied).,,\n,,\nWeek of,Primary,Secondary\n2026-07-06,Sneha,Arjun", "spreadsheet")).toBeNull();
  });
});
