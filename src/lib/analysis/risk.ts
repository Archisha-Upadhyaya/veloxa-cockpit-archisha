import { createHash } from "node:crypto";
import { z } from "zod";
import { generateGroundedAnswer } from "@/lib/ai/gemini";
import { RISK_ANALYSIS_SYSTEM } from "@/lib/ai/prompts";
import {
  extractEvidenceSnippet,
  isSensitiveEvidence,
  looksLikeRawDump,
} from "@/lib/evidence/snippet";

const riskSchema = z.object({
  risks: z.array(z.object({
    title: z.string().min(3).max(140),
    description: z.string().min(20).max(620),
    severity: z.enum(["low", "medium", "high", "critical"]),
    likelihood: z.enum(["low", "medium", "high", "unknown"]),
    confidence: z.enum(["low", "medium", "high"]),
    evidence_ids: z.array(z.string().uuid()).min(1).max(8),
  })).max(10),
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

const severityWeight: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

const likelihoodWeight: Record<string, number> = {
  high: 3,
  medium: 2,
  low: 1,
  unknown: 0,
};

/**
 * Order concerns the way a CEO reads them: severity first, then likelihood,
 * then the most recently reviewed. Postgres text ordering is alphabetical, so
 * this cannot be delegated to the database without a custom enum.
 */
export function rankRisks<
  T extends {
    severity: string;
    likelihood?: string | null;
    last_reviewed_at?: string | null;
  },
>(risks: T[]): T[] {
  return [...risks].sort((left, right) => {
    const severity =
      (severityWeight[right.severity] ?? 0) - (severityWeight[left.severity] ?? 0);
    if (severity !== 0) return severity;
    const likelihood =
      (likelihoodWeight[right.likelihood ?? "unknown"] ?? 0) -
      (likelihoodWeight[left.likelihood ?? "unknown"] ?? 0);
    if (likelihood !== 0) return likelihood;
    return (
      new Date(right.last_reviewed_at ?? 0).valueOf() -
      new Date(left.last_reviewed_at ?? 0).valueOf()
    );
  });
}

function normalizeTitle(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Analysis-generated concerns supersede the static Day-1 baseline when the
 * same concern appears twice. The Risks page can therefore show everything
 * without repeating itself.
 */
export function dedupeAndRankRisks<
  T extends {
    title: string;
    description?: string | null;
    origin?: string | null;
    severity: string;
    likelihood?: string | null;
    last_reviewed_at?: string | null;
  },
>(risks: T[]): T[] {
  const byTitle = new Map<string, T>();
  for (const risk of risks) {
    const key = normalizeTitle(risk.title);
    const existing = byTitle.get(key);
    if (!existing || (existing.origin !== "analysis" && risk.origin === "analysis")) {
      byTitle.set(key, risk);
    }
  }
  // Two fallback concerns can carry the same generic explanation. Showing the
  // same paragraph twice makes the Risks page look padded, so keep one.
  const seenDescriptions = new Set<string>();
  const unique = [...byTitle.values()].filter((risk) => {
    const description = risk.description ? normalizeTitle(risk.description) : "";
    if (description.length < 40) return true;
    if (seenDescriptions.has(description)) return false;
    seenDescriptions.add(description);
    return true;
  });
  return rankRisks(unique);
}

function conciseDescription(title: string) {
  const lowerTitle = title.toLowerCase();
  if (
    lowerTitle.includes("hiring") ||
    lowerTitle.includes("staffing") ||
    lowerTitle.includes("retention")
  ) {
    return "Open roles and a paused hiring plan may leave key work without enough people. The roles, owners, and current status should be confirmed before the next planning cycle.";
  }
  if (lowerTitle.includes("capacity")) {
    return "Workload, leave, and retention signals point to pressure on team capacity. The affected people and current coverage should be confirmed before more work is committed.";
  }
  if (lowerTitle.includes("incident")) {
    return "Operational incidents may be affecting delivery and reliability. The current impact and recovery status should be confirmed.";
  }
  if (lowerTitle.includes("financial")) {
    return "Financial figures do not reconcile cleanly across the available material. The underlying transactions and whether they remain unresolved should be confirmed.";
  }
  return "There are unresolved execution signals affecting a current commitment. The impact, owner, and next action should be confirmed.";
}

function normalizeDescription(title: string, description: string) {
  const cleaned = description
    .replace(/^Evidence-derived signal from \d+ connected records:\s*/i, "")
    .replace(/\s*This is an analytical flag for review, not a confirmed conclusion\.?\s*$/i, "")
    .replace(/\b(?:Sheet|Chunk|Row|File):?\s*[\w.-]+/gi, "")
    .trim();
  if (
    cleaned.length < 40 ||
    cleaned.length > 620 ||
    looksLikeRawDump(cleaned) ||
    isSensitiveEvidence(cleaned)
  ) {
    return conciseDescription(title);
  }
  return cleaned;
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
  const safeEvidence = evidence.filter(
    (item) => !isSensitiveEvidence(item.text) && !looksLikeRawDump(item.text),
  );
  return signalGroups.flatMap((group) => {
    const matches = safeEvidence.filter((item) => {
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
  const currentEvidence = filterEvidenceAsOf(evidence, asOf)
    .filter((item) => !isSensitiveEvidence(item.text))
    .map((item) => {
      const [sourceTitle, ...locatorParts] = item.source.split(" · ");
      const snippet = extractEvidenceSnippet(item.text, {
        context:
          "hiring staffing capacity retention payroll finance delivery launch incidents workload leave absence",
        sourceTitle,
        locator: locatorParts.join(" · "),
      });
      return {
        ...item,
        text: snippet.sensitive ? "" : snippet.summary,
      };
    })
    .filter((item) => item.text.length > 0);
  if (currentEvidence.length === 0) return [];
  const prompt = `Analyze only the evidence below.
The analysis date is ${asOf.toISOString().slice(0, 10)}. Do not use any
record that explicitly describes an event after that date.
Return JSON only in this exact shape:
{"risks":[{"title":"short decision-relevant title","description":"what the evidence says, why it matters, and what remains uncertain","severity":"low|medium|high|critical","likelihood":"low|medium|high|unknown","confidence":"low|medium|high","evidence_ids":["uuid"]}]}

How many concerns:
- Return up to 10 main concerns. A typical answer is 5-8.
- Never pad the list to hit a number. If only 3 concerns are genuinely material, return 3. If 9 are material, return 9. The maximum is 10.
- The overview surfaces the top 3 by severity; the Risks page shows the rest.

Rules:
- Identify only material business concerns or explicit evidence gaps.
- Include internal operating concerns, not only external, financial, or launch risks:
  workload imbalance, overloaded or underutilized employees, team capacity,
  leave/absence coverage, unresolved employee issues, handoff failures,
  burnout/retention signals, and operational bottlenecks.
- Do not invent owners, deadlines, facts, or causes.
- Do not label an employee overloaded or underutilized unless the evidence supports
  the comparison through workload, tasks, leave, incidents, assignments, or
  explicit employee/manager statements. State the evidence and uncertainty.
- Use one risk per distinct underlying issue.
- Cite the minimum evidence IDs that support each risk.
- If the same issue appears in multiple files, produce one risk, not duplicates.
- Prefer a cautious evidence gap over a fabricated conclusion.
- Keep the description suitable for a detail page: explain the observed facts,
  the inference, and the uncertainty in 2-4 plain sentences.
- Do not copy table rows, CSV lines, headers, file names, or chunk IDs.
- Do not mention individual salaries, payroll rows, or named employee pay.

Evidence:
${currentEvidence.map((item) => `[${item.id}] ${item.source}\n${item.text}`).join("\n\n")}`;
  try {
    const raw = await generateGroundedAnswer(
      prompt,
      RISK_ANALYSIS_SYSTEM,
      { maxOutputTokens: 4_096, timeoutMs: 30_000 },
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
