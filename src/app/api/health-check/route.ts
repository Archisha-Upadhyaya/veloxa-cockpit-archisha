import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateWithFailover } from "@/lib/ai/gemini";
import { RISK_ANALYSIS_SYSTEM } from "@/lib/ai/prompts";
import { loadAnalysisEvidence } from "@/lib/analysis/evidence";
import { filterEvidenceAsOf } from "@/lib/analysis/risk";
import { loadDirectory } from "@/lib/people/directory";
import { extractEvidenceSnippet, friendlySourceTitle } from "@/lib/evidence/snippet";

type Status = "good" | "watch" | "act" | "unknown";

const areaSchema = z.object({
  area: z.string(),
  status: z.enum(["good", "watch", "act", "unknown"]),
  headline: z.string().min(5).max(160),
  why: z.string().min(10).max(400),
  refs: z.array(z.string()).max(4).default([]),
});
const resultSchema = z.object({ areas: z.array(areaSchema) });

/**
 * On-demand company health check: one status per department (departments
 * come from the stored directory), each with a reason, its supporting
 * records, and the department head to talk to.
 */
export async function POST() {
  try {
    const supabase = createServerSupabaseClient();
    const asOf = new Date();
    const [directory, evidence, findings] = await Promise.all([
      loadDirectory(supabase, asOf),
      loadAnalysisEvidence(supabase, asOf.toISOString()),
      supabase
        .from("risk_items")
        .select("risk_key, title, polarity, severity, confidence, area, owner_employee_key")
        .in("status", ["open", "watch"])
        .eq("origin", "analysis"),
    ]);
    const active = directory.filter((person) => person.isActive);
    const departments = [...new Set(active.map((person) => person.department))].sort();
    // The most senior active person in each department is its point of contact.
    const headOf = (department: string) =>
      active
        .filter((person) => person.department === department)
        .sort((left, right) => left.level - right.level)[0] ?? null;

    type FindingRow = {
      risk_key: string;
      title: string;
      polarity: string | null;
      severity: string;
      confidence: string | null;
      area: string | null;
      owner_employee_key: string | null;
    };
    const stored = (findings.error ? [] : (findings.data ?? [])) as FindingRow[];
    const areaOf = (finding: FindingRow) =>
      finding.area ??
      active.find((person) => person.empId === finding.owner_employee_key)?.department ??
      null;

    const current = filterEvidenceAsOf(evidence, asOf)
      .map((item) => {
        const [sourceTitle, ...rest] = item.source.split(" · ");
        const snippet = extractEvidenceSnippet(item.text, { sourceTitle, locator: rest.join(" · ") });
        return snippet.sensitive || !snippet.summary
          ? null
          : { ...item, summary: snippet.summary, sourceTitle: friendlySourceTitle(sourceTitle) };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
    const byRef = new Map(current.map((item, index) => [`E${index + 1}`, item]));

    let modelAreas: z.infer<typeof areaSchema>[] | null = null;
    let model: string | null = null;
    try {
      const response = await generateWithFailover(
        `Give the CEO a status for each department of the company, based only on the evidence.
Departments: ${departments.join(", ")}.
Status meanings: "good" = evidence shows it working well; "watch" = something worth keeping an eye on; "act" = needs the CEO's attention now; "unknown" = no evidence either way (say what's missing).
Data-room records are [primary]; call transcripts are [secondary] and on their own justify at most "watch".

Return JSON: {"areas":[{"area":"<department>","status":"good|watch|act|unknown","headline":"one short line","why":"1-2 plain sentences with the specific facts","refs":["E2"]}]}
One entry per department, in the order given.

Open findings already on the CEO's brief:
${stored.map((finding) => `- [${finding.polarity ?? "concern"}, ${finding.severity}] ${finding.title} (${areaOf(finding) ?? "unassigned"})`).join("\n") || "- none"}

Evidence:
${[...byRef.entries()].map(([ref, item]) => `[${ref}] [${item.tier}] ${item.sourceTitle}: ${item.summary}`).join("\n")}`,
        RISK_ANALYSIS_SYSTEM,
        { task: "analysis", maxOutputTokens: 3_000, timeoutMs: 40_000, json: true },
      );
      const json = response.text.match(/\{[\s\S]*\}/)?.[0];
      if (json) modelAreas = resultSchema.parse(JSON.parse(json)).areas;
      model = response.model;
    } catch (error) {
      console.error("Health check model unavailable; deriving from stored findings", error);
    }

    const areas = departments.map((department) => {
      const head = headOf(department);
      const related = stored.filter((finding) => areaOf(finding) === department);
      const fromModel = modelAreas?.find((area) => area.area === department);
      const evidenceFor = (refs: string[]) =>
        refs
          .map((ref) => byRef.get(ref.trim().toUpperCase()))
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .map((item) => ({ summary: item.summary, source: item.sourceTitle, tier: item.tier }));

      if (fromModel) {
        return {
          area: department,
          status: fromModel.status as Status,
          headline: fromModel.headline,
          why: fromModel.why,
          evidence: evidenceFor(fromModel.refs),
          findings: related.map((finding) => ({ key: finding.risk_key, title: finding.title, polarity: finding.polarity })),
          contact: head ? { empId: head.empId, name: head.name, title: head.title } : null,
          people: active.filter((person) => person.department === department).length,
        };
      }
      // Stored-data fallback: status follows the worst open concern.
      const concerns = related.filter((finding) => finding.polarity !== "positive");
      const status: Status = concerns.some((finding) => ["high", "critical"].includes(finding.severity))
        ? "act"
        : concerns.length
          ? "watch"
          : related.length
            ? "good"
            : "unknown";
      return {
        area: department,
        status,
        headline: related[0]?.title ?? "No signal in the released material",
        why: related.length
          ? `${concerns.length} open ${concerns.length === 1 ? "concern" : "concerns"} and ${related.length - concerns.length} positive ${related.length - concerns.length === 1 ? "signal" : "signals"} on the brief.`
          : "Nothing released so far says how this team is doing.",
        evidence: [],
        findings: related.map((finding) => ({ key: finding.risk_key, title: finding.title, polarity: finding.polarity })),
        contact: head ? { empId: head.empId, name: head.name, title: head.title } : null,
        people: active.filter((person) => person.department === department).length,
      };
    });

    return Response.json({ checkedAt: asOf.toISOString(), mode: modelAreas ? "live" : "stored", model, areas });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ error: "Unable to run the health check." }, { status: 502 });
  }
}
