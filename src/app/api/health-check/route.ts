import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateWithFailover } from "@/lib/ai/gemini";
import { RISK_ANALYSIS_SYSTEM } from "@/lib/ai/prompts";
import { loadAnalysisEvidence } from "@/lib/analysis/evidence";
import { filterEvidenceAsOf } from "@/lib/analysis/risk";
import { loadDirectory, realDepartments, type DirectoryPerson } from "@/lib/people/directory";
import { extractEvidenceSnippet, friendlySourceTitle, redactSensitiveLines } from "@/lib/evidence/snippet";

type Status = "good" | "watch" | "act" | "unknown";
type Supabase = ReturnType<typeof createServerSupabaseClient>;

const areaSchema = z.object({
  area: z.string().min(2).max(60),
  status: z.enum(["good", "watch", "act", "unknown"]),
  headline: z.string().min(5).max(260),
  why: z.string().min(5).max(900),
  refs: z.array(z.string()).max(4).default([]),
  contact: z.string().max(20).optional(),
});
const S = { type: "STRING" };
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    areas: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          area: S,
          status: { type: "STRING", enum: ["good", "watch", "act", "unknown"] },
          headline: S,
          why: S,
          refs: { type: "ARRAY", items: S },
          contact: S,
        },
        required: ["area", "status", "headline", "why", "refs"],
      },
    },
  },
  required: ["areas"],
};

type HealthArea = {
  area: string;
  status: Status;
  headline: string;
  why: string;
  evidence: Array<{ summary: string; source: string; tier: string }>;
  contact: { empId: string; name: string; title: string } | null;
};

const contactOf = (person: DirectoryPerson | null | undefined) =>
  person ? { empId: person.empId, name: person.name, title: person.title } : null;

/** Last saved health check (null if none has run, or the table is missing). */
async function latest(supabase: Supabase) {
  const saved = await supabase
    .from("health_checks")
    .select("checked_at, mode, model, areas")
    // The retention check shares this table under its own mode.
    .neq("mode", "retention")
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (saved.error || !saved.data) return null;
  return {
    checkedAt: saved.data.checked_at as string,
    mode: saved.data.mode as string,
    model: saved.data.model as string | null,
    areas: saved.data.areas as HealthArea[],
  };
}

export async function GET() {
  try {
    return Response.json({ check: await latest(createServerSupabaseClient()) });
  } catch (error) {
    console.error("Health check read failed", error);
    return Response.json({ check: null });
  }
}

/**
 * Run the company health check: a status per business area — clients,
 * money, delivery, reliability, people — chosen from what the records
 * actually cover, not a fixed list of departments. Saved for later visits.
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
        .select("title, polarity, severity, area, owner_employee_key")
        .in("status", ["open", "watch"])
        .eq("origin", "analysis"),
    ]);
    const personas = directory.filter((person) => person.isPersona);
    const departments = realDepartments(directory);

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
    type FindingRow = { title: string; polarity: string | null; severity: string; area: string | null; owner_employee_key: string | null };
    const stored = (findings.error ? [] : (findings.data ?? [])) as FindingRow[];

    let areas: HealthArea[] | null = null;
    let model: string | null = null;
    try {
      // Lite models shed load with 503s that clear within seconds: retry twice.
      const withRetry = async (...args: Parameters<typeof generateWithFailover>) => {
        for (let attempt = 0; ; attempt += 1) {
          try {
            return await generateWithFailover(...args);
          } catch (error) {
            if (attempt >= 2) throw error;
            await new Promise((resolve) => setTimeout(resolve, 8_000 * (attempt + 1)));
          }
        }
      };
      const response = await withRetry(
        `Give the CEO a quick health check of the company: 5 to 8 areas, each with a status, based only on the evidence.

Pick the areas the evidence actually says something about. They do not have to be departments. Always include "Clients and revenue" and "Cash and spending" when the evidence has any figures for them.
Look for what is going well as hard as for what is going wrong: growth in revenue or customers, a launch kit that is ready, a team that is ramping well. A balanced check usually has some areas "good". Good areas are things like: clients and revenue, cash and spending against plan, product delivery, system reliability, hiring, team morale and retention, finance controls, marketing pipeline. Teams in this company: ${departments.join(", ")}.

Status: "good" = the evidence shows it going well; "watch" = worth keeping an eye on; "act" = needs the CEO now; "unknown" = nothing in the records either way (say what is missing). Call transcripts are [secondary]: on their own they justify at most "watch".
Area names: 1-3 plain words. Headline: one short plain sentence with the key fact, e.g. "Spend ran 18% over plan in Q3". No buzzwords.
contact: the employee id, from the list below, the CEO should talk to about this area.

People the CEO can talk to (id · name · title · team):
${personas.map((person) => `${person.empId} · ${person.name} · ${person.title} · ${person.department}`).join("\n")}

Open findings already on the CEO's brief:
${stored.map((finding) => `- [${finding.polarity ?? "concern"}, ${finding.severity}] ${finding.title}`).join("\n") || "- none"}

Evidence:
${[...byRef.entries()].map(([ref, item]) => `[${ref}] [${item.tier}] ${item.sourceTitle}\n${redactSensitiveLines(item.text).slice(0, 2_500)}`).join("\n\n")}`,
        RISK_ANALYSIS_SYSTEM,
        {
          task: "analysis",
          maxOutputTokens: 3_000,
          timeoutMs: 60_000,
          schema: RESPONSE_SCHEMA,
          // Accept any answer with an areas list; bad areas are dropped below,
          // so one malformed entry never discards the whole check.
          validate: (raw) => {
            try {
              return Array.isArray(JSON.parse(raw)?.areas);
            } catch {
              return false;
            }
          },
        },
      );
      model = response.model;
      if (process.env.VELOXA_DEBUG_ANALYSIS) console.info("[health] raw:", response.text.slice(0, 3000));
      const parsedAreas = (JSON.parse(response.text).areas as unknown[])
        .map((raw) => {
          const value = raw as Record<string, unknown>;
          const clip = (text: unknown, max: number) => (typeof text === "string" ? text.trim().slice(0, max) : text);
          return areaSchema.safeParse({
            ...value,
            area: clip(value.area, 60),
            headline: clip(value.headline, 260),
            why: clip(value.why, 900),
            refs: Array.isArray(value.refs) ? value.refs.slice(0, 4) : [],
            status: typeof value.status === "string" ? value.status.toLowerCase() : value.status,
          });
        })
        .filter((result) => result.success)
        .map((result) => result.data!);
      if (parsedAreas.length === 0) throw new Error("Health check returned no usable areas.");
      areas = parsedAreas.map((area) => ({
        area: area.area,
        status: area.status,
        headline: area.headline,
        why: area.why,
        evidence: area.refs
          .map((ref) => byRef.get(ref.trim().toUpperCase()))
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .map((item) => ({ summary: item.summary, source: item.sourceTitle, tier: item.tier ?? "primary" })),
        contact: contactOf(personas.find((person) => person.empId === area.contact?.trim().toUpperCase())),
      }));
    } catch (error) {
      console.error(
        "Health check model unavailable; deriving from stored findings",
        error instanceof Error ? error.message.split("; ").map((part) => part.slice(0, 120)).join(" | ") : error,
      );
    }

    if (!areas) {
      // Stored-data fallback: one area per team that has findings on the brief.
      areas = departments
        .map((department): HealthArea | null => {
          const related = stored.filter((finding) => finding.area === department);
          if (related.length === 0) return null;
          const concerns = related.filter((finding) => finding.polarity !== "positive");
          return {
            area: department,
            status: concerns.some((finding) => ["high", "critical"].includes(finding.severity))
              ? "act"
              : concerns.length
                ? "watch"
                : "good",
            headline: related[0].title,
            why: `${concerns.length} open ${concerns.length === 1 ? "concern" : "concerns"} on your brief.`,
            evidence: [],
            contact: contactOf(
              personas.filter((person) => person.department === department).sort((a, b) => a.level - b.level)[0],
            ),
          };
        })
        .filter((area): area is HealthArea => area !== null);
    }

    const order: Record<Status, number> = { act: 0, watch: 1, good: 2, unknown: 3 };
    areas.sort((left, right) => order[left.status] - order[right.status]);
    const check = { checkedAt: asOf.toISOString(), mode: model ? "live" : "stored", model, areas };
    const saved = await supabase
      .from("health_checks")
      .insert({ checked_at: check.checkedAt, mode: check.mode, model, areas });
    if (saved.error) console.error("Health check not saved (run the health_checks migration)", saved.error.message);
    return Response.json({ check });
  } catch (error) {
    console.error("Health check failed", error);
    return Response.json({ error: "Unable to run the health check." }, { status: 502 });
  }
}
