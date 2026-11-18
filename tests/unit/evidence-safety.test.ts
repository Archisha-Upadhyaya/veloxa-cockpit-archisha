import { describe, expect, it } from "vitest";
import {
  containsCompensationData,
  extractEvidenceSnippet,
  friendlySourceTitle,
  humanizeConcernText,
  isSensitiveEvidence,
  looksLikeRawDump,
} from "@/lib/evidence/snippet";

const payrollRegister = `Sheet: Payroll
Emp ID,Name,Month,Days Payable,Paid Days,Gross (Rs.),Deductions (Rs.),Net (Rs.)
VX011,Aisha Khan,Jan 2026,31,31,145000,18000,127000
VX007,Priya Nair,Jan 2026,31,31,210000,26000,184000`;

const payslipRows = `Sheet: Payslips
Employee,Salary,Net Pay
VX013 Siddharth Mehta,185000,148000`;

describe("payroll non-exposure", () => {
  it("marks a full payroll register sensitive", () => {
    expect(isSensitiveEvidence(payrollRegister)).toBe(true);
  });

  it("marks named individual pay rows sensitive", () => {
    expect(isSensitiveEvidence(payslipRows)).toBe(true);
  });

  it("returns no snippet for sensitive evidence", () => {
    const snippet = extractEvidenceSnippet(payrollRegister, {
      context: "salary payroll compensation",
      sourceTitle: "Payroll_Register_Jan-Mar_2026.xlsx",
    });
    expect(snippet.sensitive).toBe(true);
    expect(snippet.summary).toBe("");
  });

  it("rejects model output that leaks individual pay", () => {
    expect(
      containsCompensationData("Priya Nair's net pay is Rs. 1,84,000 this month."),
    ).toBe(true);
  });

  it("allows aggregate payroll totals", () => {
    expect(
      containsCompensationData(
        "Payroll cost centres run about ₹31.75 L a month across the company.",
      ),
    ).toBe(false);
  });
});

describe("evidence snippets", () => {
  it("turns a spreadsheet row into one short sentence", () => {
    const snippet = extractEvidenceSnippet(payslipRows, {
      context: "departure retention",
      sourceTitle: "Employee_Master.xlsx",
    });
    expect(snippet.summary.length).toBeLessThanOrEqual(300);
    expect(snippet.summary).not.toMatch(/Sheet:|VX\d{3}|,/);
  });

  it("turns a board update into readable prose, not a metric table", () => {
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
    expect(snippet.summary).not.toMatch(/Metric|Value|Runway|Rs\./);
    expect(looksLikeRawDump(snippet.summary)).toBe(false);
  });

  it("keeps a resignation extract short and factual", () => {
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

  it("uses a readable source label instead of an export file name", () => {
    expect(friendlySourceTitle("Board_Update_Jul-Sep_2026.pdf")).toBe(
      "Board update, Jul–Sep 2026",
    );
    expect(friendlySourceTitle("06.eml")).toBe("Email");
    expect(friendlySourceTitle("T2_CFO_Call.docx")).toBe("CFO call");
  });

  it("removes employee codes, locators and internal shorthand from concern text", () => {
    const text = humanizeConcernText(
      "Figures in chunk-3 cannot be reconciled. Inference: Siddharth Mehta (VX013) is named in the corpus.",
    );
    expect(text).not.toMatch(/VX\d{3}|corpus|chunk|Inference:/i);
    expect(text).toContain("Siddharth Mehta");
  });

  it("never returns a CSV header or a multi-row dump", () => {
    const ledger = `Txn Date,Voucher,Vendor / Payee,Cost Centre,Amount,Narration
2026-06-30,V-1001,Cohere Recruiting Partners,PPL-HIR,177000,Search fee
2026-06-30,V-1002,Cohere Recruiting Partners,PPL-HIR,177000,Search fee`;
    const snippet = extractEvidenceSnippet(ledger, {
      context: "hiring recruiting spend",
      sourceTitle: "GL_Export_Apr-Sep_2026.xlsx",
    });
    expect(looksLikeRawDump(snippet.summary)).toBe(false);
    expect(snippet.summary.split(",").length).toBeLessThan(5);
  });
});
