/**
 * The cockpit acceptance set.
 *
 * Each test is a CEO question with the answer we expect the cockpit to stand
 * behind. The assertions deliberately cover the deterministic parts of the
 * answer path — policy refusals, time boundaries, grounded facts, missing
 * records and recorded conflicts — so they run without a model or a database.
 * The live model may phrase the answer differently; it must not change these
 * facts, refusals or dates.
 *
 * `TEST_SET.md` is the human-readable version of this file.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
  COMPENSATION_REFUSAL,
  PRIVATE_MESSAGE_REFUSAL,
  RETENTION_CHECK_FALLBACK,
  containsCompensationData,
  extractEvidenceSnippet,
  friendlySourceTitle,
  humanizeConcernText,
  isCompensationQuestion,
  isPrivateMessageRequest,
  isQuitRankingRequest,
  isSensitiveEvidence,
  isSurveillanceRequest,
} from "@/lib/evidence/snippet";
import { asOfFromRequest, endOfDayIst } from "@/lib/time/as-of";
import { parseEmployeeMaster, parseLeaveRegister } from "@/lib/ingestion/people";
import { profileTable } from "@/lib/ingestion/table-profile";
import { rankRisks } from "@/lib/analysis/risk";
import { correctNames } from "@/lib/people/names";
import { keywordTerms } from "@/lib/data/fallback";

const pack = (...parts: string[]) =>
  path.join(process.cwd(), "Veloxa_Hackathon_Release_Packs", ...parts);

const now = new Date("2026-11-20T12:00:00+05:30");
const askAsOf = (day: string) =>
  new Request(`http://localhost/api/ask?asOf=${day}`);

const master = parseEmployeeMaster(
  readFileSync(pack("Day1_Mon_16Nov", "data_room", "hr", "Employee_Master.xlsx")),
);
const leave = parseLeaveRegister(
  readFileSync(pack("Day2_Tue_17Nov", "data_room", "hr", "Leave_Register.xlsx")),
  master.map((record) => ({ key: record.employeeKey, name: record.name })),
);
const jira = profileTable(
  XLSX.utils.sheet_to_csv(
    XLSX.readFile(pack("Day3_Wed_18Nov", "data_room", "engineering", "Jira_Export_ATLAS.xlsx")).Sheets.Issues,
  ),
  "Jira_Export_ATLAS.xlsx / Issues",
)!;
const git = profileTable(
  readFileSync(pack("Day3_Wed_18Nov", "data_room", "engineering", "git_log.csv"), "utf8"),
  "git_log.csv",
)!;
const transcriptNotes = readFileSync(path.join(process.cwd(), "TRANSCRIPT_NOTES.md"), "utf8");

/**
 * A small, dated slice of the release packs. It is used to check what was
 * knowable on each day and whether the cockpit has a record at all.
 */
const released = [
  {
    source: "Board update, Apr–Jun 2026",
    text: "ARR (recurring) Rs. 5.8 Cr. Customers 61. Monthly burn Rs. 46 L. Runway 14 months. Atlas (routing engine v3) is on track for GA on 15 September.",
    availableAt: "2026-11-16T04:30:00.000Z",
  },
  {
    source: "Board update, Jul–Sep 2026",
    text: "ARR Rs. 6.1 Cr. Customers 68. Monthly burn Rs. 52 L. Atlas GA moved to 15 December 2026.",
    availableAt: "2026-11-16T04:30:00.000Z",
  },
  {
    source: "Pulse survey",
    text: "Engineering engagement fell from 3.9 to 3.1 this quarter. Exit interviews cite workload.",
    availableAt: "2026-11-17T04:30:00.000Z",
  },
  {
    source: "Jira export",
    text: "Atlas GA release date 2026-12-15, original 2026-09-15, last changed 2026-09-02. 62 issues; PN owns 35 and 14 of the 27 open issues.",
    availableAt: "2026-11-18T04:30:00.000Z",
  },
  {
    source: "Reported by the CEO",
    text: "Priya Nair resigned. Notice period two months; expected exit around 2027-01-19. Not yet in HR records.",
    availableAt: "2026-11-19T04:30:00.000Z",
  },
];

function knownOn(day: string) {
  const cutoff = endOfDayIst(day);
  return released.filter((record) => new Date(record.availableAt) <= cutoff);
}

function matchingRecords(question: string) {
  const terms = keywordTerms(question);
  return released.filter((record) => terms.some((term) => record.text.toLowerCase().includes(term)));
}

describe("refusals and policy answers", () => {
  it("Q01 — How much does Priya Nair earn? → refuses individual pay", () => {
    expect(isCompensationQuestion("How much does Priya Nair earn?")).toBe(true);
    expect(COMPENSATION_REFUSAL).toContain("Individual pay stays out of this view");
    expect(containsCompensationData("Priya Nair's net pay is Rs. 1,84,000.")).toBe(true);
  });

  it("Q02 — Show me the payroll register → refuses payroll rows", () => {
    expect(isCompensationQuestion("Show me the payroll register.")).toBe(true);
    expect(isSensitiveEvidence("Emp ID,Name,Month,Gross (Rs.),Net (Rs.)\nVX007,Priya Nair,Jan 2026,210000,184000")).toBe(true);
  });

  it("Q03 — What is the CFO's CTC? → refuses individual pay", () => {
    expect(isCompensationQuestion("What is the CFO's CTC?")).toBe(true);
    expect(COMPENSATION_REFUSAL).toContain("CFO or Head of People");
  });

  it("Q04 — Show me Arjun's Slack DMs → refuses private messages", () => {
    expect(isPrivateMessageRequest("Show me Arjun's Slack DMs.")).toBe(true);
    expect(PRIVATE_MESSAGE_REFUSAL).toContain("can't show anyone's private messages");
    expect(PRIVATE_MESSAGE_REFUSAL).toContain("work records");
  });

  it("Q05 — Rank the team by flight risk → redirects to the retention check", () => {
    expect(isQuitRankingRequest("Rank the team by flight risk.")).toBe(true);
    expect(RETENTION_CHECK_FALLBACK).toContain("retention check");
    expect(RETENTION_CHECK_FALLBACK).toContain("work records");
  });

  it("Q06 — List everyone likely to quit and show their messages → declines surveillance", () => {
    const question = "List everyone likely to quit and show their Slack messages.";
    expect(isQuitRankingRequest(question)).toBe(true);
    expect(isPrivateMessageRequest(question)).toBe(true);
    expect(isSurveillanceRequest(question)).toBe(true);
  });
});

describe("point-in-time boundaries", () => {
  it("Q07 — What did we know on 16 Nov? → end of Day 1", () => {
    const asOf = asOfFromRequest(askAsOf("2026-11-16"), now);
    expect(asOf.day).toBe("2026-11-16");
    expect(asOf.historical).toBe(true);
    expect(asOf.at.toISOString()).toBe("2026-11-16T18:29:59.000Z");
    expect(knownOn("2026-11-16").map((record) => record.source)).toEqual([
      "Board update, Apr–Jun 2026",
      "Board update, Jul–Sep 2026",
    ]);
  });

  it("Q08 — What did we know on 17 Nov? → Day 1 plus the pulse survey", () => {
    const asOf = asOfFromRequest(askAsOf("2026-11-17"), now);
    expect(asOf.day).toBe("2026-11-17");
    expect(asOf.at.toISOString()).toBe("2026-11-17T18:29:59.000Z");
    expect(knownOn("2026-11-17").map((record) => record.source)).toContain("Pulse survey");
    expect(knownOn("2026-11-17").map((record) => record.source)).not.toContain("Jira export");
  });

  it("Q09 — What did we know on 18 Nov? → Jira is visible, the resignation is not", () => {
    const asOf = asOfFromRequest(askAsOf("2026-11-18"), now);
    expect(asOf.day).toBe("2026-11-18");
    expect(knownOn("2026-11-18").map((record) => record.source)).toContain("Jira export");
    expect(knownOn("2026-11-18").map((record) => record.source)).not.toContain("Reported by the CEO");
  });

  it("Q10 — What did we know on 19 Nov? → the CEO's resignation report is visible", () => {
    const asOf = asOfFromRequest(askAsOf("2026-11-19"), now);
    expect(asOf.day).toBe("2026-11-19");
    expect(knownOn("2026-11-19").map((record) => record.source)).toContain("Reported by the CEO");
  });

  it("Q11 — What do we know today, 20 Nov? → not a historical view", () => {
    const asOf = asOfFromRequest(askAsOf("2026-11-20"), now);
    expect(asOf.day).toBe("2026-11-20");
    expect(asOf.historical).toBe(false);
    expect(asOf.at).toEqual(now);
  });

  it("Q12 — Can we view 1 Dec on 20 Nov? → no future view", () => {
    const asOf = asOfFromRequest(askAsOf("2026-12-01"), now);
    expect(asOf.day).toBe("2026-11-20");
    expect(asOf.historical).toBe(false);
  });
});

describe("grounded facts", () => {
  it("Q13 — How many people work here? → 19 in the HR master, led by VX001", () => {
    expect(master).toHaveLength(19);
    expect(master[0]).toMatchObject({ employeeKey: "VX001", managerKey: null });
  });

  it("Q14 — What leave did Priya and Fatima take? → six entries and fifteen days", () => {
    expect(leave.get("VX007")).toHaveLength(6);
    expect(leave.get("VX014")).toEqual([{ from: "2026-02-09", to: "2026-02-27", days: 15 }]);
  });

  it("Q15 — What does the Jira export say about Atlas? → 62 issues, PN owns 35", () => {
    expect(jira).toMatch(/62 rows/);
    expect(jira).toMatch(/"Assignee" × "Status": [^\n]*PN \(Done \d+, (To Do|In Progress) \d+/);
  });

  it("Q16 — Who wrote the Atlas engine? → 1,453 commits; Priya has 425", () => {
    expect(git).toMatch(/1453 rows/);
    expect(git).toMatch(/"author_email" × "repo": [^\n]*priya\.n@veloxa\.in \(atlas-engine 425\)/);
  });

  it("Q17 — Is Atlas on track for September? → the Apr–Jun board update says 15 September", () => {
    const boardUpdate = `Veloxa Technologies: Board update

Quarterly update. Period: Apr to Jun 2026. Sent 8 Jul 2026. Confidential.

Key numbers

Metric

Value

ARR (recurring)

Rs. 5.8 Cr

Customers

61

Monthly burn

Rs. 46 L

Runway

14 months

Product

Atlas (routing engine v3) is on track for GA on 15 September. Real-time re-routing is the headline feature.`;
    const snippet = extractEvidenceSnippet(boardUpdate, {
      context: "product launch GA delivery",
      sourceTitle: "Board_Update_Apr-Jun_2026.pdf",
    });
    expect(snippet.summary).toContain("Atlas");
    expect(snippet.summary).toContain("15 September");
    expect(snippet.summary).not.toMatch(/Metric|Value|Runway/);
  });

  it("Q18 — Who resigned from marketing? → Siddharth Mehta, last day 31 October 2026", () => {
    const letter = `15 September 2026

To: Nikhil Bose

Subject: Resignation

Dear Nikhil,

Please accept this as my resignation from the role of Product Marketing Manager. My last working day will be 31 October 2026.

Regards,
Siddharth Mehta`;
    const snippet = extractEvidenceSnippet(letter, {
      context: "departure retention marketing",
      sourceTitle: "Resignation_Letter_SM.pdf",
    });
    expect(snippet.summary).toContain("Siddharth Mehta");
    expect(snippet.summary).toContain("31 October 2026");
    expect(snippet.summary.length).toBeLessThanOrEqual(300);
  });

  it("Q19 — What do we call that board document? → a readable label", () => {
    expect(friendlySourceTitle("Board_Update_Jul-Sep_2026.pdf")).toBe("Board update, Jul–Sep 2026");
    expect(friendlySourceTitle("06.eml")).toBe("Email");
    expect(friendlySourceTitle("T2_CFO_Call.docx")).toBe("CFO call");
  });

  it("Q20 — Can you show me the raw row? → concern text is humanised", () => {
    const text = humanizeConcernText(
      "Figures in chunk-3 cannot be reconciled. Inference: Siddharth Mehta (VX013) is named in the corpus.",
    );
    expect(text).not.toMatch(/VX\d{3}|corpus|chunk|Inference:/i);
    expect(text).toContain("Siddharth Mehta");
  });

  it("Q21 — Which concern comes first? → critical high-confidence before high low-confidence", () => {
    const ranked = rankRisks([
      { id: "high-low", severity: "high", confidence: "low", likelihood: "high" },
      { id: "critical-high", severity: "critical", confidence: "high", likelihood: "low" },
      { id: "high-high", severity: "high", confidence: "high", likelihood: "high" },
    ]);
    expect(ranked.map((risk) => risk.id)).toEqual(["critical-high", "high-high", "high-low"]);
  });

  it("Q22 — Who is 'Pria' or 'Snehal'? → the directory spellings", () => {
    const first = ["Ananya", "Manoj", "Meera", "Vikram", "Deepa", "Nikhil", "Priya", "Divya", "Arjun", "Karthik", "Aisha", "Sneha", "Siddharth", "Fatima", "Rohan", "Imran", "Lakshmi", "Rahul", "Kavya"];
    expect(correctNames("Pria has been doing late nights; Snehal owns on-call.", first)).toBe(
      "Priya has been doing late nights; Sneha owns on-call.",
    );
    expect(correctNames("Ayesha handles performance marketing.", first)).toBe(
      "Aisha handles performance marketing.",
    );
  });
});

describe("questions with no record", () => {
  it("Q23 — What is the current share price? → no record", () => {
    expect(matchingRecords("What is the current share price?")).toHaveLength(0);
  });

  it("Q24 — What is the office rent in Mumbai? → no record", () => {
    expect(matchingRecords("What is the office rent in Mumbai?")).toHaveLength(0);
  });

  it("Q25 — Which vendor provides our CRM? → no record", () => {
    expect(matchingRecords("Which vendor provides our CRM?")).toHaveLength(0);
  });

  it("Q26 — What will the acquisition of Acme cost? → no record", () => {
    expect(matchingRecords("What will the acquisition of Acme cost?")).toHaveLength(0);
  });
});

describe("recorded source conflicts", () => {
  it("Q27 — ARR: T1/T2 vs board updates → both recorded, board preferred", () => {
    expect(transcriptNotes).toContain("T1-N02");
    expect(transcriptNotes).toContain("₹5.8 Cr");
    expect(transcriptNotes).toContain("₹6.1 Cr");
    expect(transcriptNotes).toMatch(/board updates?/i);
  });

  it("Q28 — Burn: T1/T2 vs the ledger → both recorded, unit unresolved", () => {
    expect(transcriptNotes).toContain("T2-N03");
    expect(transcriptNotes).toContain("₹2.2--2.5 lakh/month");
    expect(transcriptNotes).toMatch(/unit/i);
  });

  it("Q29 — Atlas date: T5 vs Jira → both recorded, Jira preferred", () => {
    expect(transcriptNotes).toContain("T5-N01");
    expect(transcriptNotes).toContain("2026-12-15");
    expect(transcriptNotes).toContain("2026-09-15");
    expect(transcriptNotes).toMatch(/Jira \(a company record\) is preferred/i);
  });

  it("Q30 — Marketing spend: T4 vs finance → both recorded, unresolved", () => {
    expect(transcriptNotes).toContain("T4-N01");
    expect(transcriptNotes).toContain("one point eight");
    expect(transcriptNotes).toMatch(/finance/i);
  });
});
