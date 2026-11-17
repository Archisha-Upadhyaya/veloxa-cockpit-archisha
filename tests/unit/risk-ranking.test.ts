import { describe, expect, it } from "vitest";
import { dedupeAndRankRisks, rankRisks } from "@/lib/analysis/risk";

describe("concern ranking", () => {
  it("orders critical before high before medium", () => {
    const ranked = rankRisks([
      { id: "medium", severity: "medium", likelihood: "high" },
      { id: "critical", severity: "critical", likelihood: "low" },
      { id: "high", severity: "high", likelihood: "high" },
    ]);
    expect(ranked.map((risk) => risk.id)).toEqual([
      "critical",
      "high",
      "medium",
    ]);
  });

  it("uses likelihood and recency as tie-breakers", () => {
    const ranked = rankRisks([
      {
        id: "older",
        severity: "high",
        likelihood: "high",
        last_reviewed_at: "2026-10-01T00:00:00.000Z",
      },
      {
        id: "newer",
        severity: "high",
        likelihood: "high",
        last_reviewed_at: "2026-11-01T00:00:00.000Z",
      },
      {
        id: "less-likely",
        severity: "high",
        likelihood: "medium",
        last_reviewed_at: "2026-11-15T00:00:00.000Z",
      },
    ]);
    expect(ranked.map((risk) => risk.id)).toEqual([
      "newer",
      "older",
      "less-likely",
    ]);
  });

  it("keeps the analysis version of a duplicate title", () => {
    const ranked = dedupeAndRankRisks([
      {
        title: "Hiring plan is paused",
        origin: "bootstrap",
        severity: "high",
        description: "The baseline notes that hiring is paused.",
      },
      {
        title: "hiring plan is paused",
        origin: "analysis",
        severity: "high",
        description: "Fresh analysis confirms the hiring plan is paused.",
      },
    ]);
    expect(ranked).toHaveLength(1);
    expect(ranked[0].origin).toBe("analysis");
  });

  it("does not show the same generic description twice", () => {
    const ranked = dedupeAndRankRisks([
      {
        title: "Delivery commitment is at risk",
        origin: "analysis",
        severity: "high",
        description:
          "There are unresolved execution signals affecting a current commitment.",
      },
      {
        title: "Financial control needs review",
        origin: "analysis",
        severity: "medium",
        description:
          "There are unresolved execution signals affecting a current commitment.",
      },
    ]);
    expect(ranked).toHaveLength(1);
  });
});
