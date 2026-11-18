import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateGroundedAnswer } from "@/lib/ai/gemini";
import { EMPLOYEE_CHAT_SYSTEM } from "@/lib/ai/prompts";
import { defaultMatchThreshold, embedTexts } from "@/lib/rag/embeddings";
import { keywordEvidenceSearch, keywordTerms } from "@/lib/data/fallback";
import { loadDirectory, personFacts } from "@/lib/people/directory";
import { getPersona } from "@/lib/people/persona";
import { addressCeoCorrectly } from "@/lib/people/address";
import {
  dedupeEvidenceSummaries,
  extractEvidenceSnippet,
  factToSpeech,
  friendlySourceTitle,
  humanizeLocator,
  isCompensationQuestion,
  isGreeting,
  isSensitiveEvidence,
  safeFacts,
  redactSensitiveLines,
  sanitizeEmployeeAnswer,
} from "@/lib/evidence/snippet";

type ChatRequest = {
  question?: string;
  history?: Array<{ question: string; answer: string }>;
};
type EvidenceRow = {
  id: string;
  evidence_text: string;
  source_locations:
    | {
        locator: string;
        source_documents: { title: string; release_day?: string | null } | null;
      }
    | null;
};
type SafeEvidence = {
  id: string;
  summary: string;
  source: string;
  locator: string;
  dateLabel?: string;
  kind: string;
};

function toSafeEvidence(evidence: EvidenceRow[], question: string) {
  const seen = new Set<string>();
  const safe: SafeEvidence[] = [];
  for (const item of evidence) {
    const rawText = item.evidence_text ?? "";
    if (!rawText || isSensitiveEvidence(rawText)) continue;
    const sourceTitle =
      item.source_locations?.source_documents?.title ?? "Source";
    const locator = item.source_locations?.locator ?? "";
    const snippet = extractEvidenceSnippet(rawText, {
      context: question,
      sourceTitle,
      locator,
    });
    if (snippet.sensitive || !snippet.summary) continue;
    if (seen.has(snippet.summary)) continue;
    seen.add(snippet.summary);
    safe.push({
      id: item.id,
      summary: snippet.summary,
      source: friendlySourceTitle(sourceTitle),
      locator: humanizeLocator(locator),
      dateLabel:
        snippet.dateLabel ??
        item.source_locations?.source_documents?.release_day ??
        undefined,
      kind: snippet.kind,
    });
    if (safe.length >= 10) break;
  }
  return dedupeEvidenceSummaries(safe).slice(0, 5);
}

/**
 * Answer without the model, using only what the database holds for this
 * person: recorded interview answers, profile facts, matching evidence, and
 * the persona's stated unknowns. Nothing here is scripted content about the
 * person; when the database holds nothing relevant, the answer is null and
 * the client says so.
 */
function inferWithoutModel(
  question: string,
  name: string,
  safeEvidence: SafeEvidence[],
  recordedAnswer: string | undefined,
  groundedFacts: string[],
  knownUnknowns: string[],
): { answer: string | null; provenance: string } {
  const normalized = question.toLowerCase();
  const firstName = name.split(/\s+/)[0].toLowerCase();

  // Policy, not data: pay is never discussed regardless of what is stored.
  if (isCompensationQuestion(normalized)) {
    return {
      answer:
        "That's not something I'd discuss — pay is confidential. If there's an official question, HR would be the right route.",
      provenance: "policy_refusal",
    };
  }
  if (isGreeting(normalized)) {
    return { answer: "Hi — what's on your mind?", provenance: "conversation" };
  }

  const recorded = recordedAnswer ? sanitizeEmployeeAnswer(recordedAnswer) : null;
  if (recorded) return { answer: recorded, provenance: "recorded_context" };

  const questionTerms = keywordTerms(question);
  const aboutPerson = safeEvidence.filter((item) => {
    const summary = item.summary.toLowerCase();
    return summary.includes(firstName) || summary.includes(name.toLowerCase());
  });
  const onTopic = (aboutPerson.length > 0 ? aboutPerson : safeEvidence).find((item) =>
    questionTerms.some((term) => item.summary.toLowerCase().includes(term)),
  ) ?? aboutPerson[0];
  if (onTopic) {
    return { answer: onTopic.summary, provenance: "grounded" };
  }

  const relevantFact =
    groundedFacts.find((fact) =>
      questionTerms.some((term) => fact.toLowerCase().includes(term)),
    ) ?? groundedFacts[0];
  if (relevantFact) {
    return { answer: factToSpeech(relevantFact, name), provenance: "profile_inference" };
  }

  const unknown = knownUnknowns.find((item) =>
    questionTerms.some((term) => item.toLowerCase().includes(term)),
  );
  if (unknown) {
    return { answer: `I don't know that — ${unknown}`, provenance: "no_visibility" };
  }

  return { answer: null, provenance: "no_record" };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ employeeKey: string }> },
) {
  try {
    const { employeeKey } = await params;
    const body = (await request.json()) as ChatRequest;
    const question = body.question?.trim();
    if (!question) {
      return Response.json({ error: "question is required" }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data, error } = await supabase
      .from("employee_profiles")
      .select(
        "id, employee_key, display_name, role_title, department, profile, agent_personas(known_topics, known_unknowns, perspective_rules)",
      )
      .eq("employee_key", employeeKey)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) return Response.json({ error: "Person not found." }, { status: 404 });

    const profile = (data.profile ?? {}) as {
      interview?: Array<{
        question: string;
        answer: string;
        provenance: string;
        refs: string[];
      }>;
      groundedFacts?: string[];
    };
    const exchanges = profile.interview ?? [];
    const questionWords = question
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 3);
    const rankedExchanges = exchanges
      .map((exchange) => ({
        exchange,
        score: questionWords.filter((word) =>
          exchange.question.toLowerCase().includes(word),
        ).length,
      }))
      .sort((left, right) => right.score - left.score);
    const workQuestion =
      /(current|currently|working on|doing|task|project|busy|week)/.test(
        question.toLowerCase(),
      );
    let match = rankedExchanges.find((item) => item.score > 0)?.exchange;
    if (workQuestion) {
      const workExchanges = exchanges.filter((exchange) =>
        /(work|working|busy|doing|task|project|team|role|holding|responsib)/i.test(
          exchange.question,
        ),
      );
      const groundedWork =
        workExchanges.find((exchange) => exchange.provenance === "grounded") ??
        workExchanges[0];
      if (groundedWork) match = groundedWork;
    }

    const persona = data.agent_personas?.[0];
    const skipRetrieval =
      isGreeting(question) || isCompensationQuestion(question);
    let relatedEvidence: EvidenceRow[] = [];

    if (!skipRetrieval) {
      try {
        const vectors = await embedTexts(
          [`${data.display_name}: ${question}`, question],
          "RETRIEVAL_QUERY",
        );
        const retrieved = new Map<string, EvidenceRow>();
        for (const vector of vectors) {
          const result = await supabase.rpc("match_evidence", {
            query_embedding: vector,
            match_threshold: Math.min(defaultMatchThreshold(), 0.42),
            match_count: 8,
            as_of: new Date().toISOString(),
          });
          if (result.error) throw new Error(result.error.message);
          for (const item of (result.data ?? []) as EvidenceRow[]) {
            retrieved.set(item.id, item);
          }
        }
        relatedEvidence = [...retrieved.values()];
      } catch (error) {
        console.error("Semantic employee evidence retrieval failed", error);
        const stored = await keywordEvidenceSearch(
          supabase,
          `${data.display_name} ${question}`,
          { limit: 12 },
        );
        relatedEvidence = stored.map((item) => ({
          id: item.evidence_id,
          evidence_text: item.evidence_text,
          source_locations: {
            locator: item.locator,
            source_documents: { title: item.source_title },
          },
        }));
      }
    }

    const safeEvidence = toSafeEvidence(relatedEvidence, question);
    // Full text of every released record that names this person: what they
    // would actually know first-hand. Pay lines are removed.
    const nameTerms = String(data.display_name).split(/\s+/).filter((part: string) => part.length > 2);
    const named = await supabase
      .from("evidence_items")
      .select("evidence_text, source_locations(source_documents(title, relative_path))")
      .eq("is_sensitive", false)
      .lte("available_at", new Date().toISOString())
      .or(nameTerms.map((term: string) => `evidence_text.ilike.%${term.replace(/[%,()]/g, "")}%`).join(","))
      .limit(12);
    const firsthand = ((named.data ?? []) as unknown as Array<{
      evidence_text: string;
      source_locations: { source_documents: { title: string; relative_path: string | null } | null } | null;
    }>)
      .filter((row) => !/\/T6[a-z]?_/i.test(row.source_locations?.source_documents?.relative_path ?? ""))
      .filter((row) => !/employee[_\s-]*master/i.test(row.source_locations?.source_documents?.title ?? ""))
      .map((row) => `(${friendlySourceTitle(row.source_locations?.source_documents?.title)}) ${redactSensitiveLines(row.evidence_text).slice(0, 1_500)}`)
      .slice(0, 6);
    // Facts come from the HR master (reporting line, tenure, status) and from
    // released evidence that names this person; nothing is scripted.
    const directory = await loadDirectory(supabase);
    const person = directory.find((entry) => entry.empId === data.employee_key);
    const groundedFacts = person
      ? [...personFacts(person), ...person.mentions.map((mention) => mention.summary)]
      : safeFacts(profile.groundedFacts ?? [], 5);
    const relevantExchanges = rankedExchanges
      .filter((item) => item.score > 0)
      .slice(0, 3)
      .map((item) => {
        const cleaned = sanitizeEmployeeAnswer(item.exchange.answer);
        return cleaned ? { ...item.exchange, answer: cleaned } : null;
      })
      .filter((exchange): exchange is NonNullable<typeof exchange> => exchange !== null);

    const history = (body.history ?? []).slice(-6);
    // The person chatting is always the CEO: the top of the reporting tree.
    const ceo = directory.find((entry) => entry.tier === 0 && entry.reports.length > 0 && entry.isActive);
    const ceoFirstName = ceo?.name.split(/\s+/)[0] ?? null;
    if (ceo && ceo.empId === data.employee_key) {
      return Response.json({ error: "That's your own profile." }, { status: 400 });
    }
    if (person && !person.isPersona) {
      return Response.json(
        { error: `${data.display_name} isn't one of the people you can chat with here.` },
        { status: 403 },
      );
    }
    const voice = person && process.env.GEMINI_API_KEY
      ? await getPersona(supabase, data.id, person)
      : null;
    const firstName = data.display_name.split(/\s+/)[0];

    let answer: string | null | undefined;
    let provenance = "grounded";
    if (process.env.GEMINI_API_KEY) {
      try {
        const generated = await generateGroundedAnswer(
          `You are ${data.display_name}, ${data.role_title} in ${data.department} at Veloxa.
${ceo ? `You are talking with ${ceo.name}, the CEO of Veloxa.${person?.managerName && person.managerName !== ceo.name ? ` Your own manager is ${person.managerName}, but this conversation is with the CEO, not with ${person.managerName.split(/\s+/)[0]}.` : ""} If you address the CEO by name, call them ${ceoFirstName} — never by anyone else's name.` : "You are talking with the CEO. Do not address them by any name."}

Who you are:
${voice ? `${voice.voice}
How you talk: ${voice.speech_habits.join("; ")}.
What you care about: ${voice.cares_about.join("; ")}.
You'd know first-hand: ${voice.knows_about.join("; ")}.
You'd defer on: ${voice.would_not_know.join("; ")}.` : "A professional who is straightforward with the CEO."}

Facts about you:
${groundedFacts.map((fact) => `- ${fact}`).join("\n")}

Things you were part of or would have seen (never quote them or say where they came from):
${[...firsthand, ...relevantExchanges.map((item) => item.answer), ...safeEvidence.map((item) => item.summary)].map((fact) => `- ${fact}`).join("\n") || "- nothing specific"}

Be honest. If something above shows a problem, a delay or an open question in your area, own it plainly — never claim things are fine, complete or on schedule unless the above says so. If it isn't covered above, say you'd need to check.

${history.length ? `The conversation so far:\n${history.map((turn) => `CEO: ${turn.question}\n${firstName}: ${turn.answer}`).join("\n")}\n` : ""}CEO: ${question}
${firstName}:`,
          EMPLOYEE_CHAT_SYSTEM,
          { task: "chat", maxOutputTokens: 500, timeoutMs: 10_000 },
        );
        const cleaned = sanitizeEmployeeAnswer(
          addressCeoCorrectly(
            generated.replace(new RegExp(`^${firstName}:\\s*`), ""),
            ceoFirstName,
            directory.map((entry) => entry.name.split(/\s+/)[0]),
          ),
        );
        if (cleaned) {
          answer = cleaned;
          provenance = safeEvidence.length > 0 ? "grounded_inference" : "profile_inference";
        }
      } catch (error) {
        console.error("Gemini employee answer failed; using evidence inference", error);
      }
    }
    if (!answer) {
      const fallback = inferWithoutModel(
        question,
        data.display_name,
        safeEvidence,
        match?.answer,
        groundedFacts,
        (persona?.known_unknowns as string[] | null | undefined) ?? [],
      );
      answer = fallback.answer;
      provenance = fallback.provenance;
    }

    return Response.json({
      person: {
        employeeKey: data.employee_key,
        name: data.display_name,
        title: data.role_title,
        department: data.department,
      },
      response: {
        answer,
        provenance,
        refs: safeEvidence.map((item) => item.id),
      },
      knownTopics: persona?.known_topics ?? [],
    });
  } catch (error) {
    console.error("Employee chat query failed", error);
    return Response.json({ error: "Unable to query employee context." }, { status: 502 });
  }
}
