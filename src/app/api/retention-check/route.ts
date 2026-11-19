import { z } from "zod";
import { asOfFromRequest } from "@/lib/time/as-of";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateWithFailover } from "@/lib/ai/gemini";
import { RISK_ANALYSIS_SYSTEM } from "@/lib/ai/prompts";
import { loadAnalysisEvidence } from "@/lib/analysis/evidence";
import { filterEvidenceAsOf } from "@/lib/analysis/risk";
import { loadDirectory, personFacts } from "@/lib/people/directory";
import { correctNames } from "@/lib/people/names";
import { friendlySourceTitle, redactSensitiveLines } from "@/lib/evidence/snippet";

type Supabase = ReturnType<typeof createServerSupabaseClient>;

export type RetentionFlag = {
  empId: string;
  name: string;
  level: "check_in" | "urgent";
  reasons: Array<{ text: string; source: string }>;
  suggestion: string;
};

const flagSchema = z.object({
  id: z.string().max(20),
  level: z.enum(["check_in", "urgent"]),
  reasons: z.array(z.object({ text: z.string().min(5).max(300), ref: z.string().max(12) })).min(1).max(4),
  suggestion: z.string().min(5).max(300),
});
const S = { type: "STRING" };
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    people: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          id: S,
          level: { type: "STRING", enum: ["check_in", "urgent"] },
          reasons: { type: "ARRAY", items: { type: "OBJECT", properties: { text: S, ref: S }, required: ["text", "ref"] } },
          suggestion: S,
        },
        required: ["id", "level", "reasons", "suggestion"],
      },
    },
  },
  required: ["people"],
};

async function latest(supabase: Supabase, before?: Date) {
  const saved = await supabase
    .from("health_checks")
    .select("checked_at, model, areas")
    .eq("mode", "retention")
    .lte("checked_at", (before ?? new Date()).toISOString())
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (saved.error || !saved.data) return null;
  return { checkedAt: saved.data.checked_at as string, model: saved.data.model as string | null, people: saved.data.areas as RetentionFlag[] };
}

export async function GET(request: Request) {
  try {
    // Viewing a past day shows the last check run on or before that day.
    return Response.json({ check: await latest(createServerSupabaseClient(), asOfFromRequest(request).at) });
  } catch {
    return Response.json({ check: null });
  }
}

/**
 * On-demand retention watch: who the CEO may want to check in with, and why,
 * based only on work records (workload, on-call load, ownership of open work,
 * explicit statements in emails or calls, notice status). No scores, no
 * private messages, no pay data. Saved for later visits.
 */
export async function POST() {
  try {
    const supabase = createServerSupabaseClient();
    const asOf = new Date();
    const [directory, evidence] = await Promise.all([
      loadDirectory(supabase, asOf),
      loadAnalysisEvidence(supabase, asOf.toISOString()),
    ]);
    const people = directory.filter((person) => person.isActive && person.level > 0);
    const records = filterEvidenceAsOf(evidence, asOf);
    const byRef = new Map(records.map((item, index) => [`E${index + 1}`, item]));

    const { text, model } = await generateWithFailover(
      `List the people the CEO may want to check in with about workload or retention, based only on these work records.

Go through the on-call rota, the incident log (who responded), the ticket export (who owns open work), the git log profile (who commits where, and drops), emails and call notes. Count only signals in the records: one person carrying an on-call rota or most incidents; owning most of the open work; long hours or "late nights" mentioned; asking about ownership or role; a big drop in their output; being on notice or reported as resigned; exit-interview or pulse themes that clearly concern their team.
Do NOT use or guess at private messages, personal life, health, pay, or protected characteristics. No scores or probabilities. Do not include someone without a concrete record-based reason. Usually 2-6 people; zero is fine.
Records name people inconsistently (initials like "PN", email handles, misspellings like "Pria" or "Snehal"): match them to the directory.
"urgent" = several strong signals; otherwise "check_in". Statuses marked "reported by the CEO" are added separately: never cite a record for them, but do look for records about the same person's workload or ownership.
Write each reason with the person's first name and the specific fact (e.g. "Sneha was primary on-call every week Jul–Oct"), never "the employee".
For each reason, cite the record ref it comes from. suggestion = one practical thing the CEO could do or ask.

People (id · name · title · team · facts):
${people.map((person) => `${person.empId} · ${person.name} · ${person.title} · ${person.department} · ${personFacts(person).slice(1).join("; ")}`).join("\n")}

Records:
${[...byRef.entries()].map(([ref, item]) => `[${ref}] [${item.tier}] ${friendlySourceTitle(item.source.split(" · ")[0])}\n${redactSensitiveLines(item.text).slice(0, 2_500)}`).join("\n\n")}`,
      RISK_ANALYSIS_SYSTEM,
      {
        task: "analysis",
        maxOutputTokens: 3_000,
        timeoutMs: 60_000,
        schema: RESPONSE_SCHEMA,
        validate: (raw) => {
          try {
            return Array.isArray(JSON.parse(raw)?.people);
          } catch {
            return false;
          }
        },
      },
    );

    const flags: RetentionFlag[] = (JSON.parse(text).people as unknown[])
      .map((raw) => flagSchema.safeParse(raw))
      .filter((result) => result.success)
      .map((result) => result.data!)
      .flatMap((flag) => {
        const person = people.find((entry) => entry.empId === flag.id.trim().toUpperCase());
        if (!person) return [];
        // Every reason must point at a real record.
        const reasons = flag.reasons
          .map((reason) => ({ text: reason.text, record: byRef.get(reason.ref.trim().toUpperCase()) }))
          .filter((reason) => reason.record)
          .map((reason) => ({ text: reason.text, source: friendlySourceTitle(reason.record!.source.split(" · ")[0]) }));
        // A reported status is the CEO's own information: added here with that
        // source, and any reason the model tied to it is dropped.
        const ownReasons = person.reported
          ? reasons.filter((reason) => !/\b(resign|notice|leav(e|ing)|depart)/i.test(reason.text))
          : reasons;
        const reportedReason = person.reported
          ? [{
              text: `${person.name.split(" ")[0]} has ${person.status.toLowerCase()}${person.exitDate ? `; last day around ${person.exitDate}` : ""}.`,
              source: "Reported by you",
            }]
          : [];
        if (ownReasons.length === 0 && reportedReason.length === 0) return [];
        const names = people.map((entry) => entry.name.split(" ")[0]);
        return [{
          empId: person.empId,
          name: person.name,
          level: person.reported ? "urgent" : flag.level,
          reasons: [...reportedReason, ...ownReasons].map((reason) => ({ ...reason, text: correctNames(reason.text, names) })),
          suggestion: correctNames(flag.suggestion, names),
        }];
      })
      .sort((left, right) => (left.level === right.level ? 0 : left.level === "urgent" ? -1 : 1));
    for (const person of people.filter((entry) => entry.reported && !flags.some((flag) => flag.empId === entry.empId))) {
      flags.unshift({
        empId: person.empId,
        name: person.name,
        level: "urgent",
        reasons: [{ text: `${person.name.split(" ")[0]} has ${person.status.toLowerCase()}${person.exitDate ? `; last day around ${person.exitDate}` : ""}.`, source: "Reported by you" }],
        suggestion: `Agree a handover plan for ${person.name.split(" ")[0]}'s work during the notice period.`,
      });
    }

    const check = { checkedAt: asOf.toISOString(), model, people: flags };
    const saved = await supabase
      .from("health_checks")
      .insert({ checked_at: check.checkedAt, mode: "retention", model, areas: flags });
    if (saved.error) console.error("Retention check not saved", saved.error.message);
    return Response.json({ check });
  } catch (error) {
    console.error("Retention check failed", error);
    return Response.json({ error: "The retention check couldn't run right now. Try again in a minute." }, { status: 502 });
  }
}
