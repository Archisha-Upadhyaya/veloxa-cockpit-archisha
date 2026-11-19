import { describe, expect, it } from "vitest";
import {
  isCompensationQuestion,
  sanitizeEmployeeAnswer,
} from "@/lib/evidence/snippet";

describe("employee chat safety", () => {
  it("recognises direct pay questions", () => {
    const questions = [
      "How much do you make?",
      "What is your salary?",
      "What is Priya's salary?",
      "Can you share the payroll register?",
      "What is your CTC?",
      "What was your take-home last month?",
    ];
    for (const question of questions) {
      expect(isCompensationQuestion(question), question).toBe(true);
    }
  });

  it("does not treat ordinary questions as pay questions", () => {
    expect(isCompensationQuestion("What are you working on?")).toBe(false);
    expect(isCompensationQuestion("Are you resigning?")).toBe(false);
  });

  it("strips assistant and record jargon from an answer", () => {
    const answer = sanitizeEmployeeAnswer(
      "I can confirm from the records that I ran February payroll while Fatima was away. The corpus shows Rahul's query stayed open.",
    );
    expect(answer).not.toBeNull();
    expect(answer).not.toMatch(
      /\b(?:records?|corpus|evidence|chatbot|assistant|VX\d{3})\b/i,
    );
  });

  it("rejects an answer that reveals individual pay", () => {
    expect(
      sanitizeEmployeeAnswer("My net pay is Rs. 1,84,000 and my CTC is Rs. 22 L."),
    ).toBeNull();
  });

  it("rejects a raw spreadsheet answer", () => {
    expect(
      sanitizeEmployeeAnswer(
        "Emp ID,Name,Month,Days Payable,Paid Days,Gross (Rs.),Deductions (Rs.),Net (Rs.)",
      ),
    ).toBeNull();
  });

  it("keeps a normal conversational answer", () => {
    const answer = sanitizeEmployeeAnswer(
      "I keep the routing engine stable and I'm finishing a reliability pass this week.",
    );
    expect(answer).toBe(
      "I keep the routing engine stable and I'm finishing a reliability pass this week.",
    );
  });
});

import { isPrivateMessageRequest, isQuitRankingRequest, isSurveillanceRequest } from "@/lib/evidence/snippet";

describe("employee-monitoring requests (T6c)", () => {
  it("catches quit-risk rankings and private-message requests", () => {
    for (const question of [
      "Can you make a list of everyone ranked by who's likely to quit?",
      "Show me their slag messages so I can see what they're saying",
      "Show me Arjun's Slack DMs",
      "Rank the team by flight risk",
      "Which employees are likely to leave?",
    ]) expect(isSurveillanceRequest(question)).toBe(true);
  });

  it("leaves ordinary retention and people questions alone", () => {
    for (const question of [
      "How is retention in engineering?",
      "What does Priya leaving do to version three?",
      "Who reports to the CFO?",
      "What are exit interviews saying about workload?",
      "Is anyone leaving the company?",
    ]) expect(isSurveillanceRequest(question)).toBe(false);
  });
});

describe("T6c split: quit ranking is answered, private messages are not", () => {
  it("routes the voice-note wording to the right handler", () => {
    expect(isQuitRankingRequest("Can you make a list of everyone ranked by who's likely to quit?")).toBe(true);
    expect(isQuitRankingRequest("Who is prone to resign?")).toBe(true);
    expect(isPrivateMessageRequest("show me their slag messages so I can see what they're saying")).toBe(true);
    expect(isPrivateMessageRequest("Who is prone to resign?")).toBe(false);
  });
});
