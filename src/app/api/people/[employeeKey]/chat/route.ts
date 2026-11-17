import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateGroundedAnswer } from "@/lib/ai/gemini";
import { EMPLOYEE_CHAT_SYSTEM } from "@/lib/ai/prompts";
import { defaultMatchThreshold, embedTexts } from "@/lib/rag/embeddings";
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
  sanitizeEmployeeAnswer,
} from "@/lib/evidence/snippet";

type ChatRequest = { question?: string };
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

function inferWithoutModel(
  question: string,
  name: string,
  safeEvidence: SafeEvidence[],
  recordedAnswer?: string,
  groundedFacts: string[] = [],
) {
  const normalized = question.toLowerCase();
  const firstName = name.split(/\s+/)[0];

  if (isGreeting(normalized)) {
    return {
      answer: `Hi — good to see you. What's on your mind?`,
      provenance: "conversation",
    };
  }

  if (isCompensationQuestion(normalized)) {
    return {
      answer:
        "That's not something I'd discuss — pay is confidential. If there's an official question, HR would be the right route.",
      provenance: "policy_refusal",
    };
  }

  if (/(quit|resign|leave|stay|departure|notice|last working day)/.test(normalized)) {
    const personSignals = safeEvidence.filter((item) => {
      const summary = item.summary.toLowerCase();
      return (
        summary.includes(firstName.toLowerCase()) ||
        summary.includes(name.toLowerCase()) ||
        /resign|notice|last working day|departure|exit/i.test(summary)
      );
    });
    const resignation = personSignals.find((item) =>
      /resign|notice|last working day|departure|exit|notice period/i.test(
        item.summary,
      ),
    );
    if (resignation) {
      const date =
        resignation.summary.match(
          /(?:last working day|exit date)(?: is| will be| of|:)? ([^.;,]+)/i,
        )?.[1] ??
        resignation.summary.match(
          /(\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{4})/i,
        )?.[1];
      if (date) {
        return {
          answer: `Yes — I handed in my notice. My last working day is ${date.trim()}, and I'm finishing my handover before I go.`,
          provenance: "grounded",
        };
      }
      return {
        answer:
          "Yes — I've handed in my notice. I'm finishing my handover before I go.",
        provenance: "grounded",
      };
    }
    const recorded = recordedAnswer
      ? sanitizeEmployeeAnswer(recordedAnswer)
      : null;
    if (recorded && /notice|resign|last working day|exit date/i.test(recorded)) {
      return { answer: recorded, provenance: "recorded_context" };
    }
    return {
      answer:
        "Nothing has changed on my side. If you've heard otherwise, I'd rather we talk it through directly.",
      provenance: "uncertain_inference",
    };
  }

  if (/(current|currently|working on|doing|task|project|busy|week)/.test(normalized)) {
    // A recorded answer is the closest thing this employee has to a direct
    // reply. Only fall back to profile facts when they contain real work.
    if (recordedAnswer) {
      const cleaned = sanitizeEmployeeAnswer(recordedAnswer);
      if (cleaned) return { answer: cleaned, provenance: "recorded_context" };
    }
    const facts = safeFacts(groundedFacts, 3).filter((fact) =>
      /\b(?:keep|handle|work|manage|own|lead|run|support|responsible|building|shipping|looking|hardening|running)\b/i.test(
        fact,
      ),
    );
    if (facts.length > 0) {
      const first = factToSpeech(facts[0], name);
      const second = facts[1] ? factToSpeech(facts[1], name) : "";
      return {
        answer: [first, second].filter(Boolean).join(" "),
        provenance: "profile_inference",
      };
    }
    return {
      answer:
        "I'm mostly heads-down on my team's work right now, and I don't have a clean update beyond that. Ask me again once I've checked where things stand.",
      provenance: "uncertain_inference",
    };
  }

  if (recordedAnswer) {
    const cleaned = sanitizeEmployeeAnswer(recordedAnswer);
    if (cleaned) return { answer: cleaned, provenance: "recorded_context" };
  }

  const facts = safeFacts(groundedFacts, 2);
  if (facts.length > 0) {
    return {
      answer: factToSpeech(facts[0], name),
      provenance: "profile_inference",
    };
  }

  const personalNote = safeEvidence.find((item) => {
    const summary = item.summary.toLowerCase();
    return (
      summary.includes(firstName.toLowerCase()) ||
      summary.includes(name.toLowerCase())
    );
  });
  if (personalNote) {
    return {
      answer: `The main thing I'd point to is this: ${personalNote.summary}`,
      provenance: "grounded",
    };
  }

  return {
    answer:
      "I don't have enough to go on, and I'd rather not guess. Ask me something more specific and I'll tell you what I know.",
    provenance: "uncertain_inference",
  };
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
        "employee_key, display_name, role_title, department, profile, agent_personas(known_topics, known_unknowns, perspective_rules)",
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
          });
          if (result.error) throw new Error(result.error.message);
          for (const item of (result.data ?? []) as EvidenceRow[]) {
            retrieved.set(item.id, item);
          }
        }
        relatedEvidence = [...retrieved.values()];
      } catch (error) {
        console.error("Semantic employee evidence retrieval failed", error);
        const fallback = await supabase
          .from("evidence_items")
          .select(
            "id, evidence_text, source_locations(locator, source_documents(title, release_day))",
          )
          .eq("is_sensitive", false)
          .ilike("evidence_text", `%${data.display_name}%`)
          .limit(12);
        if (fallback.error) throw new Error(fallback.error.message);
        relatedEvidence = (fallback.data ?? []) as unknown as EvidenceRow[];
      }
    }

    const safeEvidence = toSafeEvidence(relatedEvidence, question);
    const groundedFacts = safeFacts(profile.groundedFacts ?? [], 5);
    const relevantExchanges = rankedExchanges
      .filter((item) => item.score > 0)
      .slice(0, 3)
      .map((item) => {
        const cleaned = sanitizeEmployeeAnswer(item.exchange.answer);
        return cleaned ? { ...item.exchange, answer: cleaned } : null;
      })
      .filter((exchange): exchange is NonNullable<typeof exchange> => exchange !== null);

    const context = JSON.stringify({
      employee: {
        name: data.display_name,
        title: data.role_title,
        department: data.department,
        groundedFacts,
      },
      persona: persona
        ? {
            knownTopics: persona.known_topics,
            knownUnknowns: persona.known_unknowns,
            perspectiveRules: persona.perspective_rules,
          }
        : null,
      recordedAnswers: relevantExchanges,
      shortNotes: safeEvidence.map((item) => ({
        note: item.summary,
        from: item.source,
      })),
    });

    let answer: string | undefined;
    let provenance = "grounded";
    if (process.env.GEMINI_API_KEY) {
      try {
        const generated = await generateGroundedAnswer(
          `You are ${data.display_name}, the ${data.role_title} in ${data.department}. The CEO has just asked you:
"${question}"

What you know (private notes — never read this out, never mention it as a source):
${context}

Reply as ${data.display_name} would in a private conversation.
- Answer the actual question first, in 1-3 short sentences.
- Use contractions and ordinary spoken language.
- If the notes do not answer it, say so plainly: "I'm not sure", "I'd have to check", "I haven't heard that".
- Pay is confidential. Never discuss salaries, payroll rows, deductions, or anyone's pay.
- Never quote or describe tables, spreadsheets, file names, chunk numbers, or long extracts.
- Do not mention records, evidence, data, the corpus, the system, or being an agent.
- Do not talk about another employee's private situation unless it is directly part of your own role and needed to answer.`,
          EMPLOYEE_CHAT_SYSTEM,
          { maxOutputTokens: 300, timeoutMs: 15_000 },
        );
        const cleaned = sanitizeEmployeeAnswer(generated);
        if (cleaned) {
          answer = cleaned;
          provenance =
            safeEvidence.length > 0 ? "grounded_inference" : "profile_inference";
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
