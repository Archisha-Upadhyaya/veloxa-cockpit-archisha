import { z } from "zod";
import { generateWithFailover } from "@/lib/ai/gemini";
import { RISK_ANALYSIS_SYSTEM } from "@/lib/ai/prompts";
import { analyzeEvidence, calibrateSeverity, type AnalyzedRisk } from "@/lib/analysis/risk";

type Evidence = Parameters<typeof analyzeEvidence>[0][number] & { group?: string };
type Directory = Parameters<typeof analyzeEvidence>[2];

const consolidatedSchema = z.object({
  findings: z.array(z.object({
    polarity: z.enum(["concern", "positive"]),
    title: z.string().min(3).max(140),
    observed: z.string().min(10).max(700),
    inference: z.string().min(10).max(600),
    recommended_action: z.string().min(10).max(400),
    severity: z.enum(["low", "medium", "high", "critical"]),
    area: z.string().nullable().optional(),
    from: z.array(z.number().int().nonnegative()).min(1),
  })).max(16),
});
const S = { type: "STRING" };
const CONSOLIDATED_SCHEMA = {
  type: "OBJECT",
  properties: {
    findings: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          polarity: { type: "STRING", enum: ["concern", "positive"] },
          title: S,
          observed: S,
          inference: S,
          recommended_action: S,
          severity: { type: "STRING", enum: ["low", "medium", "high", "critical"] },
          area: S,
          from: { type: "ARRAY", items: { type: "INTEGER" } },
        },
        required: ["polarity", "title", "observed", "inference", "recommended_action", "severity", "from"],
      },
    },
  },
  required: ["findings"],
};
const SEVERITY = ["low", "medium", "high", "critical"] as const;
const CONFIDENCE = ["low", "medium", "high"] as const;

/** Combine findings that describe the same issue: union of evidence, strongest wording. */
function combine(findings: AnalyzedRisk[]): AnalyzedRisk {
  const lead = [...findings].sort(
    (left, right) =>
      right.evidence_ids.length - left.evidence_ids.length ||
      SEVERITY.indexOf(right.severity) - SEVERITY.indexOf(left.severity),
  )[0];
  const rationale = Object.assign({}, ...findings.map((finding) => finding.rationale)) as Record<string, string>;
  const evidenceIds = Object.keys(rationale);
  const confidence = CONFIDENCE[Math.max(...findings.map((finding) => CONFIDENCE.indexOf(finding.confidence)))];
  const severity = SEVERITY[Math.max(...findings.map((finding) => SEVERITY.indexOf(finding.severity)))];
  return {
    ...lead,
    rationale,
    evidence_ids: evidenceIds,
    confidence,
    severity: lead.polarity === "positive" ? "low" : calibrateSeverity(severity, confidence, evidenceIds.length),
  };
}

/**
 * Analyse the corpus folder by folder (in parallel), then merge findings that
 * describe the same issue. Smaller batches let even the fallback model keep
 * distinct issues apart; the merge pass removes the duplicates that batching
 * creates. Call transcripts are added to every batch as secondary context.
 */
export async function analyzeCorpus(evidence: Evidence[], asOf: Date, directory: Directory) {
  const secondary = evidence.filter((item) => item.tier === "secondary");
  const groups = new Map<string, Evidence[]>();
  for (const item of evidence.filter((entry) => entry.tier !== "secondary")) {
    const key = item.group ?? "other";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  if (groups.size <= 1) return analyzeEvidence(evidence, asOf, directory);

  // At most three batches at a time, and one retry after a pause: the free
  // tier sheds load with 503s, and a lost batch means lost findings.
  const runBatch = async (batch: Evidence[]) => {
    const first = await analyzeEvidence([...batch, ...secondary], asOf, directory);
    if (first) return first;
    await new Promise((resolve) => setTimeout(resolve, 8_000));
    return analyzeEvidence([...batch, ...secondary], asOf, directory);
  };
  const queue = [...groups.values()];
  const batches: Awaited<ReturnType<typeof analyzeEvidence>>[] = [];
  while (queue.length) {
    batches.push(...(await Promise.all(queue.splice(0, 3).map(runBatch))));
  }
  const succeeded = batches.filter((batch): batch is NonNullable<typeof batch> => batch !== null);
  if (succeeded.length === 0) return null;
  const all = succeeded.flatMap((batch) => batch.risks);
  const models = [...new Set(succeeded.map((batch) => batch.model))].join(", ");
  if (all.length <= 1) return { risks: all, model: models };
  if (process.env.VELOXA_DEBUG_ANALYSIS) {
    console.info(`[analysis] ${succeeded.length}/${batches.length} batches, ${all.length} findings before merge:`);
    all.forEach((finding, index) => console.info(`  ${index}. [${finding.area}] ${finding.title}`));
  }

  // Union-find over finding indexes.
  const parent = all.map((_, index) => index);
  const root = (index: number): number => (parent[index] === index ? index : (parent[index] = root(parent[index])));
  const join = (left: number, right: number) => {
    const a = root(left);
    const b = root(right);
    if (a !== b) parent[b] = a;
  };

  const primaryIds = new Set(evidence.filter((item) => item.tier !== "secondary").map((item) => item.id));
  // 1. Deterministic: same area and polarity, citing the same record.
  for (let left = 0; left < all.length; left += 1) {
    for (let right = left + 1; right < all.length; right += 1) {
      const a = all[left];
      const b = all[right];
      if (a.polarity !== b.polarity || (a.area ?? "") !== (b.area ?? "")) continue;
      // Transcripts are shared context in every batch, so only a shared
      // data-room record means two findings are the same issue.
      if (a.evidence_ids.some((id) => primaryIds.has(id) && b.evidence_ids.includes(id))) join(left, right);
    }
  }

  // 2. Consolidation pass: the model rewrites the batch findings into the
  // final list, citing which batch findings each one is built from. Evidence
  // and "why" lines are carried over from those findings, never rewritten.
  // Overloaded (503) lite models usually recover within seconds: retry twice.
  const consolidate = async (prompt: string, options: Parameters<typeof generateWithFailover>[2]) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await generateWithFailover(prompt, RISK_ANALYSIS_SYSTEM, options);
      } catch (error) {
        if (attempt >= 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10_000 * (attempt + 1)));
      }
    }
  };
  try {
    const { text } = await consolidate(
      `Below are findings about one company, produced separately from different folders of its records, so the same issue often appears several times in different words.

Write the final list for the CEO:
- Merge findings only when they describe the same underlying issue (e.g. three wordings of "Atlas launch delayed").
- Keep different issues as separate findings even when related. These are always separate: a launch delay; system incidents and on-call load; team morale or attrition; hiring and offer acceptance; payroll process or payroll queries; revenue or burn figures that conflict; marketing spend or lead-quality disputes; a resignation.
- If one input finding mixes two issues, you may split it: cite it in both.
- Keep the specific facts (names, numbers, dates) from the inputs. Do not add new facts.
- Name people. When a record names someone, use their full name from the directory, never "one individual" or "a team member". Records spell names inconsistently (auto-transcripts, short names, initials, email handles, typos such as "Snehal" or "Pria"): match them to the directory by role and team, and only when the spelling in the record differs from the directory name, say so once ("Snehal in the incident log is Sneha Kulkarni, the only SRE").
- Explain the "so what" in plain words: what would break, slip or cost money if nothing changes.
- Titles: sentence case, plain words, at most 10 words, and say what is actually wrong or right — e.g. "Board and call figures for burn differ tenfold", "Atlas launch moved from 15 Sep to 15 Dec". Never a label like "Financial reporting inconsistencies" or "Engineering delivery risk".
- Write like a sharp chief of staff talking to the CEO: short sentences, concrete numbers and names, no buzzwords ("synergy", "alignment", "leverage", "robust", "holistic", "operational excellence").
- "from" lists the input numbers each final finding is built from. Every input must be used at least once.

Company directory (name · title · team):
${(directory ?? []).map((person) => `${person.name} · ${person.title} · ${person.department}`).join("\n")}

Inputs:
${all.map((finding, index) => `${index}. [${finding.polarity}] [${finding.area ?? "—"}] ${finding.title}
   observed: ${finding.observed}
   why it matters: ${finding.inference}
   next step: ${finding.recommended_action}`).join("\n")}`,
      {
        task: "analysis",
        maxOutputTokens: 8_000,
        timeoutMs: 90_000,
        schema: CONSOLIDATED_SCHEMA,
        validate: (raw) => {
          try {
            return consolidatedSchema.safeParse(JSON.parse(raw)).success;
          } catch {
            return false;
          }
        },
      },
    );
    const final: AnalyzedRisk[] = consolidatedSchema.parse(JSON.parse(text)).findings.flatMap((item): AnalyzedRisk[] => {
      const sources = [...new Set(item.from)].filter((index) => index < all.length).map((index) => all[index]);
      if (sources.length === 0) return [];
      const base = combine(sources);
      const area: string | null = sources.some((source) => source.area === item.area) ? item.area ?? null : base.area;
      return [{
        ...base,
        polarity: item.polarity,
        title: item.title,
        observed: item.observed,
        inference: item.inference,
        recommended_action: item.recommended_action,
        area,
        owner_employee_key: sources.find((source) => source.area === area)?.owner_employee_key ?? base.owner_employee_key,
        description: `${item.observed} ${item.inference}`.slice(0, 620),
        severity:
          item.polarity === "positive"
            ? ("low" as const)
            : calibrateSeverity(item.severity, base.confidence, base.evidence_ids.length),
      }];
    });
    const covered = new Set(
      consolidatedSchema.parse(JSON.parse(text)).findings.flatMap((item) => item.from),
    );
    // Inputs the model forgot are kept rather than dropped.
    all.forEach((finding, index) => {
      if (!covered.has(index)) final.push(finding);
    });
    if (process.env.VELOXA_DEBUG_ANALYSIS) {
      console.info(`[analysis] consolidated into ${final.length}: ${final.map((finding) => finding.title).join(" | ")}`);
    }
    return { risks: final, model: models };
  } catch (error) {
    console.error("Consolidation pass failed; using record-overlap merge", error);
  }

  if (process.env.VELOXA_DEBUG_ANALYSIS) {
    console.info(`[analysis] clusters: ${JSON.stringify(all.map((_, index) => root(index)))}`);
  }
  const clusters = new Map<number, AnalyzedRisk[]>();
  all.forEach((finding, index) => {
    const key = root(index);
    clusters.set(key, [...(clusters.get(key) ?? []), finding]);
  });
  const merged = [...clusters.values()].map((members) => (members.length === 1 ? members[0] : combine(members)));
  return { risks: merged, model: models };
}
