import { createHash } from "node:crypto";
import { z } from "zod";
import { generateWithFailover } from "@/lib/ai/gemini";
import { RISK_ANALYSIS_SYSTEM } from "@/lib/ai/prompts";
import {
  isSensitiveEvidence,
  redactSensitiveLines,
  looksLikeRawDump,
} from "@/lib/evidence/snippet";

const citationSchema = z.object({
  ref: z.string().min(1).max(12),
  why: z.string().min(10).max(300),
});

const findingSchema = z.object({
  polarity: z.enum(["concern", "positive"]).default("concern"),
  title: z.string().min(3).max(140),
  observed: z.string().min(20).max(600),
  inference: z.string().min(20).max(500),
  recommended_action: z.string().min(10).max(360),
  severity: z.enum(["low", "medium", "high", "critical"]),
  likelihood: z.enum(["low", "medium", "high", "unknown"]),
  confidence: z.enum(["low", "medium", "high"]),
  area: z.string().max(60).optional(),
  owner: z.string().max(20).optional(),
  evidence: z.array(citationSchema).max(8),
});

const riskSchema = z.object({
  // Forces a pass over every record before findings are written, which
  // matters most on the smaller fallback models.
  takeaways: z.array(z.object({ ref: z.string(), takeaway: z.string() })).optional(),
  findings: z.array(findingSchema).max(14),
});

type ParsedFinding = z.infer<typeof findingSchema>;
export type AnalyzedRisk = Omit<ParsedFinding, "evidence" | "area" | "owner"> & {
  area: string | null;
  owner_employee_key: string | null;
  description: string;
  evidence_ids: string[];
  /** Why each cited record supports this finding, keyed by evidence id. */
  rationale: Record<string, string>;
};

const SEVERITY_ORDER = ["low", "medium", "high", "critical"] as const;

const STRING = { type: "STRING" };
/** Gemini structured-output schema matching riskSchema. */
const FINDINGS_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    takeaways: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: { ref: STRING, takeaway: STRING }, required: ["ref", "takeaway"] },
    },
    findings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          polarity: { type: "STRING", enum: ["concern", "positive"] },
          title: STRING,
          observed: STRING,
          inference: STRING,
          recommended_action: STRING,
          severity: { type: "STRING", enum: ["low", "medium", "high", "critical"] },
          likelihood: { type: "STRING", enum: ["low", "medium", "high", "unknown"] },
          confidence: { type: "STRING", enum: ["low", "medium", "high"] },
          area: STRING,
          owner: STRING,
          evidence: {
            type: "ARRAY",
            items: { type: "OBJECT", properties: { ref: STRING, why: STRING }, required: ["ref", "why"] },
          },
        },
        required: ["polarity", "title", "observed", "inference", "recommended_action", "severity", "likelihood", "confidence", "evidence"],
      },
    },
  },
  required: ["takeaways", "findings"],
};

function parsesAsFindings(text: string) {
  try {
    return riskSchema.safeParse(JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "")).success;
  } catch {
    return false;
  }
}

/**
 * Severity is capped by how well the finding is supported: a concern backed
 * by little evidence, or held at low confidence, can never rank as high.
 */
export function calibrateSeverity(
  severity: AnalyzedRisk["severity"],
  confidence: AnalyzedRisk["confidence"],
  evidenceCount: number,
): AnalyzedRisk["severity"] {
  let cap: AnalyzedRisk["severity"] = "critical";
  if (evidenceCount <= 1 || confidence === "low") cap = "medium";
  if (evidenceCount === 0) cap = "low";
  return SEVERITY_ORDER.indexOf(severity) > SEVERITY_ORDER.indexOf(cap) ? cap : severity;
}



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
const confidenceWeight: Record<string, number> = { high: 3, medium: 2, low: 1 };

/** Severity weighted by confidence: a well-evidenced high concern outranks a
 * shaky critical one. */
function priorityScore(risk: { severity: string; confidence?: string | null }) {
  return (severityWeight[risk.severity] ?? 0) * (confidenceWeight[risk.confidence ?? "low"] ?? 1);
}

export function rankRisks<
  T extends {
    severity: string;
    confidence?: string | null;
    likelihood?: string | null;
    last_reviewed_at?: string | null;
  },
>(risks: T[]): T[] {
  return [...risks].sort((left, right) => {
    const priority = priorityScore(right) - priorityScore(left);
    if (priority !== 0) return priority;
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
    confidence?: string | null;
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

function cleanField(value?: string) {
  if (!value) return undefined;
  const cleaned = value.trim();
  if (looksLikeRawDump(cleaned) || isSensitiveEvidence(cleaned)) return undefined;
  return cleaned;
}


export function riskFingerprint(risk: Pick<AnalyzedRisk, "title" | "evidence_ids">) {
  const evidence = [...risk.evidence_ids].sort().join(",");
  const category = risk.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return createHash("sha256").update(`${category}|${evidence}`).digest("hex");
}

export async function analyzeEvidence(evidence: Array<{
  id: string;
  text: string;
  source: string;
  tier?: "primary" | "secondary";
}>, asOf = new Date(), directory: Array<{
  key: string;
  name: string;
  title: string;
  department: string;
  /** e.g. "Resigned, expected exit around 2027-01-19 (reported by the CEO…)" */
  status?: string;
}> = []) {
  // The released corpus is small, so the model reads each record in full
  // (with any pay lines removed) rather than a one-line summary.
  const currentEvidence = filterEvidenceAsOf(evidence, asOf)
    .filter((item) => !isSensitiveEvidence(item.text))
    .map((item) => ({ ...item, text: redactSensitiveLines(item.text).slice(0, 3_000).trim() }))
    .filter((item) => item.text.length > 0)
    // Data-room records first; call transcripts are secondary support.
    .sort((left, right) => (left.tier === "secondary" ? 1 : 0) - (right.tier === "secondary" ? 1 : 0));
  if (currentEvidence.length === 0) return null;

  // Short labels instead of UUIDs: models copy "E7" reliably, and anything
  // that does not map back to a supplied record is dropped.
  const byRef = new Map(currentEvidence.map((item, index) => [`E${index + 1}`, item]));

  const prompt = `You are preparing the CEO's morning brief. Analyze only the evidence below.
The analysis date is ${asOf.toISOString().slice(0, 10)}. Ignore any record describing an event after that date.

Work in two steps, both in the JSON:
1. "takeaways": for EVERY record, one line on what it tells the CEO (a number, a change, a gap, a conflict with another record, an unanswered question). Look especially for: figures that differ between records, processes done unusually or by a stand-in, questions or requests with no recorded answer, plans that changed, people leaving or on leave, survey scores moving, spend against plan.
2. "findings": group the takeaways into findings.

Return JSON only, in exactly this shape:
{"takeaways":[{"ref":"E1","takeaway":"..."}],
"findings":[{
  "polarity":"concern|positive",
  "title":"specific: name the project, team, figure or date",
  "observed":"only what the cited records state — names, numbers, dates. 1-3 sentences.",
  "inference":"why this matters to the business, and what is still uncertain. Must add something the observed text does not say.",
  "recommended_action":"one concrete step: which role the CEO should ask, and for exactly what figure, document or decision",
  "severity":"low|medium|high|critical",
  "likelihood":"low|medium|high|unknown",
  "confidence":"low|medium|high",
  "area":"the one department this belongs to, from the list below",
  "owner":"employee id of the one person the CEO should talk to about it, from the list below",
  "evidence":[{"ref":"E3","why":"what in this record supports the finding, in one sentence"}]
}]}

What to return:
- Up to 10 concerns (things going wrong or at risk) and up to 4 positives (things genuinely going well). Never pad.
- A positive needs the same standard of evidence as a concern. For a positive, recommended_action is how to protect or build on it.
- Every finding must cite at least one record, and should cite every record that supports it. "why" must state the specific fact in that record that supports the finding, e.g. "Board update says GA moved from 15 Sep to an unstated date after reliability work", never "Contains the letter" or "Mentions Atlas".
- Prefer [primary] records; [secondary] call transcripts may support or add colour, but a finding resting only on a transcript must be confidence "low".
- confidence: high = two or more primary records agree; medium = one primary record, or primary + transcript; low = transcript only, or records conflict.
- severity reflects business impact if true; do not inflate it.

Rules:
- One finding per underlying issue; merge duplicates of the same issue across files, but never merge different issues. A payroll control gap, a delivery slip, a spend mismatch and a resignation are four findings, even if they are related. With this many records, expect roughly 5-10 findings.
- Do not invent owners, causes, deadlines or dates. Only use dates that appear in the evidence.
- Do not call an employee overloaded or underused unless the evidence compares workload, leave, tasks or explicit statements. When it does (e.g. one person on every on-call week), say so plainly and name them.
- Name people. When a record names someone, use their full name from the directory, never "one individual" or "a team member". Records spell names inconsistently (auto-transcripts, short names, initials, email handles, typos such as "Snehal" or "Pria"): match them to the directory by role and team, and only when the spelling in the record differs from the directory name, say so once ("Snehal in the incident log is Sneha Kulkarni, the only SRE").
- Explain the "so what" in plain words: what would break, slip or cost money if nothing changes.
- recommended_action must never be generic ("review with the owner", "confirm the status").
- Write for a busy CEO: plain words, no jargon, no table rows, file names or chunk ids.
- Titles: sentence case, plain words, at most 10 words, and say what is actually wrong or right — e.g. "Board and call figures for burn differ tenfold", "Atlas launch moved from 15 Sep to 15 Dec". Never a label like "Financial reporting inconsistencies" or "Engineering delivery risk".
- Write like a sharp chief of staff talking to the CEO: short sentences, concrete numbers and names, no buzzwords ("synergy", "alignment", "leverage", "robust", "holistic", "operational excellence").
- Never mention individual salaries, payroll rows, or anyone's pay.

${directory.length ? `Company directory (id · name · title · department · status):
${directory.map((person) => `${person.key} · ${person.name} · ${person.title} · ${person.department}${person.status ? ` · ${person.status}` : ""}`).join("\n")}

A status marked "reported by the CEO" is not evidence: never cite it as a record. Use it to judge impact, and say the departure is "reported, not yet in HR records". When a reported departure affects work these records show that person owns or leads (tickets, commits, plans), raise it as its own finding, citing those records as evidence: what they own, how much of the open work that is, and the dates at risk.

` : ""}Evidence:
${[...byRef.entries()].map(([ref, item]) => `[${ref}] [${item.tier ?? "primary"}] ${item.source}\n${item.text}`).join("\n\n")}`;

  try {
    const { text: raw, model } = await generateWithFailover(
      prompt,
      RISK_ANALYSIS_SYSTEM,
      {
        task: "analysis",
        maxOutputTokens: 12_000,
        timeoutMs: 90_000,
        schema: FINDINGS_RESPONSE_SCHEMA,
        // A malformed answer moves on to the next model instead of failing.
        validate: parsesAsFindings,
      },
    );
    const json = raw.match(/\{[\s\S]*\}/)?.[0];
    if (!json) throw new Error("Risk analysis did not return JSON.");
    const risks: AnalyzedRisk[] = riskSchema.parse(JSON.parse(json)).findings.flatMap((finding) => {
      const rationale: Record<string, string> = {};
      for (const citation of finding.evidence) {
        const record = byRef.get(citation.ref.trim().toUpperCase());
        const why = cleanField(citation.why);
        if (record && why && !rationale[record.id]) rationale[record.id] = why;
      }
      const evidenceIds = Object.keys(rationale);
      // No valid evidence, no finding.
      if (evidenceIds.length === 0) return [];
      const observed = cleanField(finding.observed);
      const inference = cleanField(finding.inference);
      const action = cleanField(finding.recommended_action);
      if (!observed || !inference || !action) return [];
      const primaryCount = evidenceIds.filter(
        (id) => currentEvidence.find((item) => item.id === id)?.tier !== "secondary",
      ).length;
      const confidence = primaryCount === 0 ? "low" : finding.confidence;
      const departments = new Set(directory.map((person) => person.department));
      const owner = directory.find((person) => person.key === finding.owner?.trim().toUpperCase());
      const area = finding.area && departments.has(finding.area.trim())
        ? finding.area.trim()
        : owner?.department ?? null;
      return [{
        area,
        owner_employee_key: owner?.key ?? null,
        polarity: finding.polarity,
        title: finding.title.trim(),
        description: `${observed} ${inference}`.slice(0, 620),
        observed,
        inference,
        recommended_action: action,
        severity:
          finding.polarity === "positive"
            ? "low"
            : calibrateSeverity(finding.severity, confidence, evidenceIds.length),
        likelihood: finding.likelihood,
        confidence,
        evidence_ids: evidenceIds,
        rationale,
      }];
    });
    return { risks, model };
  } catch (error) {
    // No canned findings: the caller keeps what the database already holds.
    console.error("Model risk analysis unavailable; keeping stored concerns", error);
    return null;
  }
}
