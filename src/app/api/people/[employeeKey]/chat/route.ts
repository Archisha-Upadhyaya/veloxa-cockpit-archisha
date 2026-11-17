import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateGroundedAnswer } from "@/lib/ai/gemini";
import { embedTexts } from "@/lib/rag/embeddings";

type ChatRequest = { question?: string };
type EvidenceRow = {
  id: string;
  evidence_text: string;
  source_locations: { locator: string; source_documents: { title: string } } | null;
};

function inferWithoutModel(
  question: string,
  name: string,
  evidence: EvidenceRow[],
  recordedAnswer?: string,
  groundedFacts: string[] = [],
) {
  const normalized = question.toLowerCase();
  const toSpeech = (fact: string) => {
    const normalizedFact = fact.replace(/[()"]/g, "").replace(/\s+/g, " ").trim();
    const wedding = normalizedFact.match(/out for (?:her|his) wedding in ([^;]+); "([^"]+)"/i);
    if (wedding) {
      return `I was out for my wedding in ${wedding[1]}, which made that month ${wedding[2]}.`;
    }
    const followUp = normalizedFact.match(/Will check and get back on (.+?)\s*[—-]\s*no further record/i);
    if (followUp) {
      return `I said I would check and get back on ${followUp[1]}. I do not see a later resolution recorded.`;
    }
    return normalizedFact
      .replace(/^Keeps\b/i, "I keep")
      .replace(/^Handles\b/i, "I handle")
      .replace(/^Works\b/i, "I work")
      .replace(/^Manages\b/i, "I manage")
      .replace(/^Supports\b/i, "I support");
  };
  const cleanExcerpt = (text: string) =>
    text
      .replace(/From:.*?(?=To:|Subject:|$)/gi, "")
      .replace(/To:.*?(?=Subject:|$)/gi, "")
      .replace(/Subject:.*?(?=\n|$)/gi, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/\s+/g, " ")
      .replace(/^["'\s]+|["'\s]+$/g, "")
      .trim();
  const excerpts = evidence
    .slice(0, 3)
    .map((item) => cleanExcerpt(item.evidence_text))
    .filter(Boolean);

  if (/(current|currently|working on|doing|task|project)/.test(normalized)) {
    const usefulFacts = groundedFacts
      .filter((fact) => !/employee master/i.test(fact))
      .slice(0, 3);
    if (usefulFacts.length > 0) {
      return {
        answer: usefulFacts.map(toSpeech).join(" "),
        provenance: "profile_inference",
      };
    }
    if (excerpts.length > 0) {
      return {
        answer: `I’m focused on ${excerpts[0].replace(/^.*?(?:team:|summary|key points)\s*/i, "")}.${excerpts[1] ? ` I’m also following up on ${excerpts[1].slice(0, 220)}.` : ""}`,
        provenance: "evidence_inference",
      };
    }
    if (recordedAnswer && !recordedAnswer.includes("check the Jira")) {
      return { answer: recordedAnswer, provenance: "recorded_context" };
    }
    return {
      answer: `${name}'s connected records do not show a recent task update, so I cannot name a current project confidently. That is a missing activity signal, not evidence that no work is happening.`,
      provenance: "activity_gap",
    };
  }

  if (/(quit|resign|leave|stay|departure|notice)/.test(normalized)) {
    const signals = evidence.filter((item) =>
      /(resign|notice period|departure|leav|exit date|retention|unhappy|frustrat)/i.test(
        item.evidence_text,
      ),
    );
    if (signals.length > 0) {
      return {
        answer: `I’ve had some pressure around ${signals
          .slice(0, 2)
          .map((item) => cleanExcerpt(item.evidence_text))
          .join(" ")} That may be worth discussing, but it would be unfair to say that means I want to resign without hearing it from me.`,
        provenance: "evidence_inference",
      };
    }
    return {
      answer: `I haven’t said that I want to resign, and there is no direct notice or resignation signal for me in the information available. If you’re concerned about how I’m doing, I’d rather talk about it directly than have my intentions guessed.`,
      provenance: "uncertain_inference",
    };
  }

  if (recordedAnswer && !recordedAnswer.includes("I do not have a recorded answer")) {
    return { answer: recordedAnswer, provenance: "recorded_context" };
  }
  if (excerpts.length > 0) {
    return {
      answer: `From what I’m dealing with, ${excerpts[0]}. I may be missing context here, so I’d rather clarify than present that as the whole picture.`,
      provenance: "evidence_inference",
    };
  }
  return {
    answer: `I don’t have enough context to answer that honestly. I’d rather say that directly than pretend certainty about what I think or feel.`,
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
    const match = exchanges.find((exchange) =>
      question
        .toLowerCase()
        .split(/\s+/)
        .some(
          (word) =>
            word.length > 3 &&
            exchange.question.toLowerCase().includes(word),
        ),
    );

    const persona = data.agent_personas?.[0];
    let relatedEvidence: EvidenceRow[] = [];
    try {
      const vectors = await embedTexts(
        [`${data.display_name}: ${question}`, question],
        "RETRIEVAL_QUERY",
      );
      const retrieved = new Map<string, EvidenceRow>();
      for (const vector of vectors) {
        const result = await supabase.rpc("match_evidence", {
          query_embedding: vector,
          match_threshold: 0.42,
          match_count: 6,
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
          "id, evidence_text, source_locations(locator, source_documents(title))",
        )
        .eq("is_sensitive", false)
        .ilike("evidence_text", `%${data.display_name}%`)
        .limit(12);
      if (fallback.error) throw new Error(fallback.error.message);
      relatedEvidence = (fallback.data ?? []) as unknown as EvidenceRow[];
    }

    const context = JSON.stringify({
      employee: {
        name: data.display_name,
        title: data.role_title,
        department: data.department,
        profile: data.profile,
      },
      persona: persona
        ? {
            knownTopics: persona.known_topics,
            knownUnknowns: persona.known_unknowns,
            perspectiveRules: persona.perspective_rules,
          }
        : null,
      recordedInterviewAnswers: exchanges,
      relatedEvidence: relatedEvidence.map((item) => ({
        id: item.id,
        text: item.evidence_text,
        source: `${item.source_locations?.source_documents.title ?? "Unknown source"} · ${item.source_locations?.locator ?? ""}`,
      })),
    });

    let answer: string | undefined;
    let provenance = "grounded";
    if (process.env.GEMINI_API_KEY) {
      try {
        answer = await generateGroundedAnswer(
          `You are speaking as ${data.display_name}, a real human employee in a private conversation with the CEO.
Question from the CEO: ${question}

Connected employee profile, recorded answers, and retrieved evidence:
${context}

Answer rules:
- Answer naturally in first person, as this employee—not as an AI, analyst, database, or evidence system.
- Never claim a task, feeling, intention, or current activity as a fact unless a record supports it.
- You may make a clearly labeled inference from multiple records. Use language such as "I would read that as...", "the records suggest...", or "I cannot say that for certain, but...".
- For questions like whether I want to quit, infer only from resignation/notice records, direct statements, recurring concerns, or relevant events. Do not equate stress, disagreement, or an evidence gap with intent to resign.
- For current-work questions, use Jira, git, incident, email, launch, or project evidence when present; summarize the most recent relevant activity and its date.
- If evidence is weak, answer conversationally with the best-supported interpretation and state the uncertainty in ordinary human language. Do not say "connected records", "retrieved evidence", "the corpus", "the system", or tell the CEO to add another export.
- Keep the answer to 3-6 concise sentences and mention the supporting source type when useful.`,
          "You are an evidence-grounded employee perspective assistant. Preserve the distinction between recorded fact and inference. Speak naturally, do not invent, and do not use canned no-visibility refusals when a cautious inference is possible.",
        );
        provenance = relatedEvidence.length > 0 ? "grounded_inference" : "profile_inference";
      } catch (error) {
        console.error("Gemini employee answer failed; using evidence inference", error);
      }
    }
    if (!answer) {
      const fallback = inferWithoutModel(
        question,
        data.display_name,
        relatedEvidence,
        match?.answer,
        profile.groundedFacts ?? [],
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
        refs: match?.refs ?? relatedEvidence.map((item) => item.id),
      },
      knownTopics: persona?.known_topics ?? [],
    });
  } catch (error) {
    console.error("Employee chat query failed", error);
    return Response.json({ error: "Unable to query employee context." }, { status: 502 });
  }
}
