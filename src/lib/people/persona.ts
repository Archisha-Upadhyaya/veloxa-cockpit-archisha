import { z } from "zod";
import type { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateWithFailover } from "@/lib/ai/gemini";
import { personFacts, type DirectoryPerson } from "@/lib/people/directory";

type SupabaseClient = ReturnType<typeof createServerSupabaseClient>;

const PERSONA_VERSION = "records-v2";

/** A persona describes who someone reports to, so it is tied to that line. */
function personaVersion(person: DirectoryPerson) {
  return `${PERSONA_VERSION}:${person.managerId ?? "top"}:${person.title}`;
}

const personaSchema = z.object({
  voice: z.string().min(20).max(400),
  speech_habits: z.array(z.string().min(3).max(140)).max(4),
  cares_about: z.array(z.string().min(3).max(140)).max(5),
  knows_about: z.array(z.string().min(3).max(160)).max(8),
  would_not_know: z.array(z.string().min(3).max(160)).max(6),
});

export type Persona = z.infer<typeof personaSchema>;

const PERSONA_SYSTEM = `You write short character notes for an actor who will play a real employee talking to their CEO.
Derive everything from the supplied facts: role, seniority, tenure, team, reporting line, and how the person comes across in the documents and call notes.
Return JSON only. No invented life events, feelings, opinions or facts. Personality should be a plausible, distinct working style for that role and situation — e.g. a new joiner is careful and eager, a long-tenured lead is direct and protective of their team, a finance person is precise about numbers.`;

/**
 * A distinctive, records-derived personality for each employee. Generated
 * once, then stored in agent_personas so every conversation with that person
 * sounds like the same person.
 */
export async function getPersona(
  supabase: SupabaseClient,
  employeeProfileId: string,
  person: DirectoryPerson,
): Promise<Persona | null> {
  const stored = await supabase
    .from("agent_personas")
    .select("voice_profile, persona_version")
    .eq("employee_profile_id", employeeProfileId)
    .maybeSingle();
  if (stored.data?.persona_version === personaVersion(person)) {
    const parsed = personaSchema.safeParse(stored.data.voice_profile);
    if (parsed.success) return parsed.data;
  }

  const facts = [
    ...personFacts(person),
    person.tenure ? `Tenure: ${person.tenure}` : null,
    ...person.mentions.map((mention) => `${mention.source}: ${mention.summary}`),
  ].filter(Boolean);

  try {
    const { text } = await generateWithFailover(
      `Employee: ${person.name}
Facts:
${facts.map((fact) => `- ${fact}`).join("\n")}

Return:
{"voice":"2 sentences on how this person talks and carries themselves with the CEO",
 "speech_habits":["2-4 concrete verbal habits, e.g. 'leads with the number, then the caveat'"],
 "cares_about":["what they would focus on in their job"],
 "knows_about":["topics they would plausibly know first-hand from their role and the facts"],
 "would_not_know":["topics outside their role they would defer on, and to whom"]}`,
      PERSONA_SYSTEM,
      { task: "chat", maxOutputTokens: 900, timeoutMs: 20_000, json: true },
    );
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    if (!json) return null;
    const persona = personaSchema.parse(JSON.parse(json));
    await supabase.from("agent_personas").upsert(
      {
        employee_profile_id: employeeProfileId,
        voice_profile: persona,
        known_topics: persona.knows_about,
        known_unknowns: persona.would_not_know,
        perspective_rules: persona.speech_habits,
        persona_version: personaVersion(person),
      },
      { onConflict: "employee_profile_id" },
    );
    return persona;
  } catch (error) {
    console.error(`Persona generation failed for ${person.name}`, error);
    return null;
  }
}
