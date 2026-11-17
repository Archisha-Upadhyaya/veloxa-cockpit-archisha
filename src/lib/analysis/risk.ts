import { createHash } from "node:crypto";
import { z } from "zod";
import { generateGroundedAnswer } from "@/lib/ai/gemini";

const riskSchema = z.object({
  risks: z.array(z.object({
    title: z.string().min(3),
    description: z.string().min(20),
    severity: z.enum(["low", "medium", "high", "critical"]),
    likelihood: z.enum(["low", "medium", "high", "unknown"]),
    confidence: z.enum(["low", "medium", "high"]),
    evidence_ids: z.array(z.string().uuid()).min(1).max(8),
  })).max(12),
});

export type AnalyzedRisk = z.infer<typeof riskSchema>["risks"][number];

const monthNumbers: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2,
  april: 3, apr: 3, may: 4, june: 5, jun: 5, july: 6, jul: 6,
  august: 7, aug: 7, september: 8, sep: 8, october: 9, oct: 9,
  november: 10, nov: 10, december: 11, dec: 11,
};

function hasFutureDatedEvent(text: string, asOf: Date) {
  const year = asOf.getUTCFullYear();
  const dateCandidates: Date[] = [];
  for (const match of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?[\/.-](\d{1,2})(?:[\/.-](\d{2,4}))?\b/g)) {
    const candidateYear = match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : year;
    const month = Number(match[2]) - 1;
    if (month >= 0 && month < 12) dateCandidates.push(new Date(Date.UTC(candidateYear, month, Number(match[1]))));
  }
  for (const match of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?\b/g)) {
    const month = monthNumbers[match[2].toLowerCase()];
    if (month === undefined) continue;
    dateCandidates.push(new Date(Date.UTC(Number(match[3] ?? year), month, Number(match[1]))));
  }
  for (const match of text.matchAll(/\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*|\s+)(\d{4})\b/g)) {
    const month = monthNumbers[match[1].toLowerCase()];
    if (month !== undefined) dateCandidates.push(new Date(Date.UTC(Number(match[3]), month, Number(match[2]))));
  }
  return dateCandidates.some((candidate) => !Number.isNaN(candidate.valueOf()) && candidate > asOf);
}

export function filterEvidenceAsOf<T extends { text: string }>(evidence: T[], asOf = new Date()) {
  return evidence.filter((item) => !hasFutureDatedEvent(item.text, asOf));
}

function conciseDescription(title: string) {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("capacity") || lowerTitle.includes("retention")) {
    return "Records indicate possible capacity or retention pressure in the company. The people affected, current impact, and appropriate response should be confirmed.";
  }
  if (lowerTitle.includes("incident")) {
    return "Records indicate an operational incident pattern that may affect delivery. The current impact and recovery status should be confirmed.";
  }
  if (lowerTitle.includes("financial")) {
    return "Records indicate a financial control issue that may need review. The underlying transaction and whether it remains unresolved should be confirmed.";
  }
  if (lowerTitle.includes("hiring") || lowerTitle.includes("staffing")) {
    return "Records indicate a possible staffing gap or execution constraint. The role, owner, and current hiring status should be confirmed.";
  }
  return "Records indicate an execution concern that needs review. The current impact, owner, and next action should be confirmed.";
}

function normalizeDescription(title: string, description: string) {
  const cleaned = description
    .replace(/^Evidence-derived signal from \d+ connected records:\s*/i, "")
    .replace(/\s*This is an analytical flag for review, not a confirmed conclusion\.?\s*$/i, "")
    .trim();
  return cleaned.length >= 40 && cleaned.length <= 420 ? cleaned : conciseDescription(title);
}

const signalGroups = [
  {
    terms: ["overload", "workload", "capacity", "backfill", "unassigned", "leave", "resign", "notice period", "departure"],
    title: "Internal capacity and retention signals need review",
    severity: "medium" as const,
    likelihood: "medium" as const,
  },
  {
    terms: ["incident", "outage", "pagerduty", "on-call", "severity", "postmortem"],
    title: "Operational incidents are creating delivery exposure",
    severity: "high" as const,
    likelihood: "medium" as const,
  },
  {
    terms: ["payroll", "payslip", "reconciliation", "ledger", "burn", "arr", "control"],
    title: "Financial records contain unresolved control signals",
    severity: "high" as const,
    likelihood: "medium" as const,
  },
  {
    terms: ["hiring", "unfilled", "recruit", "role", "headcount"],
    title: "Hiring and staffing capacity may constrain execution",
    severity: "medium" as const,
    likelihood: "medium" as const,
  },
  {
    terms: ["launch", "ga", "slip", "blocked", "bug", "jira", "milestone"],
    title: "Delivery commitments have unresolved execution signals",
    severity: "high" as const,
    likelihood: "medium" as const,
  },
];

function inferRisksFromEvidence(evidence: Array<{ id: string; text: string; source: string }>) {
  return signalGroups.flatMap((group) => {
    const matches = evidence.filter((item) => {
      const text = item.text.toLowerCase();
      return group.terms.some((term) => text.includes(term));
    }).slice(0, 6);
    if (matches.length === 0) return [];
    return [{
      title: group.title,
      description: conciseDescription(group.title),
      severity: group.severity,
      likelihood: group.likelihood,
      confidence: matches.length >= 2 ? "medium" as const : "low" as const,
      evidence_ids: matches.map((item) => item.id),
    }];
  });
}

export function riskFingerprint(risk: AnalyzedRisk) {
  const evidence = [...risk.evidence_ids].sort().join(",");
  const category = risk.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return createHash("sha256").update(`${category}|${evidence}`).digest("hex");
}

export async function analyzeEvidence(evidence: Array<{
  id: string;
  text: string;
  source: string;
}>, asOf = new Date()) {
  const currentEvidence = filterEvidenceAsOf(evidence, asOf);
  if (currentEvidence.length === 0) return [];
  const prompt = `You are Veloxa's risk-analysis service. Analyze only the evidence below.
The analysis date is ${asOf.toISOString().slice(0, 10)}. Do not use any
record that explicitly describes an event after that date, even if it is
present in the supplied corpus.
Return JSON only in this exact shape:
{"risks":[{"title":"short decision-relevant title","description":"what the evidence says, why it matters, and what remains uncertain","severity":"low|medium|high|critical","likelihood":"low|medium|high|unknown","confidence":"low|medium|high","evidence_ids":["uuid"]}]}

Rules:
- Identify only material business concerns or explicit evidence gaps.
- Include internal operating concerns, not only external, financial, or launch risks:
  workload imbalance, overloaded or underutilized employees, team capacity,
  leave/absence coverage, unresolved employee issues, handoff failures,
  burnout/retention signals, and operational bottlenecks.
- Do not invent owners, deadlines, facts, or causes.
- Do not label an employee overloaded or underutilized unless the records support
  the comparison through workload, tasks, leave, incidents, assignments, or
  explicit employee/manager statements. State the evidence and uncertainty.
- Use one risk per distinct underlying issue.
- Cite the minimum evidence IDs that support each risk.
- If the same issue appears in multiple files, produce one risk, not duplicates.
- Prefer a cautious evidence gap over a fabricated conclusion.
- Keep the description suitable for a detail page: explain the observed facts,
  the inference, and the uncertainty without mentioning a record count.

Evidence:
${currentEvidence.map((item) => `[${item.id}] ${item.source}\n${item.text}`).join("\n\n")}`;
  try {
    const raw = await generateGroundedAnswer(
      prompt,
      "You are a conservative enterprise risk-analysis service. Return only the requested JSON. Use only supplied evidence, preserve uncertainty, and never invent facts.",
    );
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("Risk analysis did not return JSON.");
    return riskSchema.parse(JSON.parse(json)).risks.map((risk) => ({
      ...risk,
      description: normalizeDescription(risk.title, risk.description),
    }));
  } catch (error) {
    console.error("Model risk analysis unavailable; using evidence-derived signals", error);
    return inferRisksFromEvidence(currentEvidence);
  }
}
