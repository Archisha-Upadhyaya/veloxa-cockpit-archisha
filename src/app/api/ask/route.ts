import { createServerSupabaseClient } from "@/lib/supabase/server";
import { generateWithFailover } from "@/lib/ai/gemini";
import { CEO_ASK_SYSTEM } from "@/lib/ai/prompts";
import { embedTexts } from "@/lib/rag/embeddings";
import { retrieveEvidence, type RetrievedEvidence } from "@/lib/rag/retrieve";
import { keywordEvidenceSearch } from "@/lib/data/fallback";
import { loadDirectory, personFacts } from "@/lib/people/directory";
import { loadAnalysisEvidence } from "@/lib/analysis/evidence";
import {
  dedupeEvidenceSummaries,
  extractEvidenceSnippet,
  friendlySourceTitle,
  humanizeLocator,
  isCompensationQuestion,
  isSensitiveEvidence,
  redactSensitiveLines,
} from "@/lib/evidence/snippet";

type AskRequest = {
  question?: string;
  history?: Array<{ question: string; answer: string }>;
};

/** Notes about people are only included when the question is about people. */
const PEOPLE_QUESTION = /\b(who|whom|team|teams|report|reports|manager|managers|people|staff|employee|employees|headcount|hire|hired|joined|leav|left|notice|department|org|structure|lead|leads|head)\w*/i;

async function findEvidence(question: string): Promise<RetrievedEvidence[]> {
  const supabase = createServerSupabaseClient();
  let found: RetrievedEvidence[] = [];
  try {
    const [vector] = await embedTexts([question], "RETRIEVAL_QUERY");
    if (vector) found = await retrieveEvidence(vector, { limit: 10, threshold: 0.35 });
  } catch (error) {
    console.error("Ask: semantic retrieval unavailable, using stored keyword search", error);
  }
  if (found.length < 3) {
    const keyword = await keywordEvidenceSearch(supabase, question, { limit: 10 });
    const seen = new Set(found.map((item) => item.evidence_id));
    found = [...found, ...keyword.filter((item) => !seen.has(item.evidence_id))];
  }
  // CEO voice notes are never treated as company evidence.
  return found.filter((item) => !/^T6[a-z]?_/i.test(item.source_title));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AskRequest;
    const question = body.question?.trim();
    if (!question) return Response.json({ error: "question is required" }, { status: 400 });
    const history = (body.history ?? []).slice(-4);

    if (isCompensationQuestion(question)) {
      return Response.json({
        answer:
          "Individual pay stays out of this view. For payroll totals or a specific case, the CFO or Head of People can take you through it directly.",
        sources: [],
        mode: "policy",
      });
    }

    // Follow-ups like "and what about finance?" need the earlier question.
    const searchText = [history.at(-1)?.question, question].filter(Boolean).join(" ");
    const supabase = createServerSupabaseClient();
    const [records, directory, findings] = await Promise.all([
      loadAnalysisEvidence(supabase, new Date().toISOString()),
      loadDirectory(supabase),
      supabase
        .from("risk_items")
        .select("title, observed, polarity")
        .in("status", ["open", "watch"])
        .eq("origin", "analysis")
        .limit(20),
    ]);
    // The released corpus is small enough to read whole, so answers never
    // miss a record that a similarity search failed to surface. Larger
    // corpora fall back to retrieval.
    const corpus = records.length <= 80 ? records : null;
    const retrieved = corpus ? [] : await findEvidence(searchText);
    const sources = corpus
      ? corpus
          .sort((left, right) => (left.tier === "secondary" ? 1 : 0) - (right.tier === "secondary" ? 1 : 0))
          .map((item) => {
            const [title, ...locator] = item.source.split(" · ");
            return {
              id: item.id,
              text: redactSensitiveLines(item.text).slice(0, 2_500),
              summary: extractEvidenceSnippet(item.text, { context: searchText, sourceTitle: title, locator: locator.join(" · ") }).summary,
              source: `${friendlySourceTitle(title)}${item.tier === "secondary" ? " (call)" : ""}`,
              locator: humanizeLocator(locator.join(" · ")),
              date: null as string | null,
            };
          })
          .filter((item) => item.text && item.summary)
      : dedupeEvidenceSummaries(
          retrieved
            .filter((item) => !isSensitiveEvidence(item.evidence_text))
            .map((item) => {
              const snippet = extractEvidenceSnippet(item.evidence_text, {
                context: searchText,
                sourceTitle: item.source_title,
                locator: item.locator,
              });
              if (snippet.sensitive || !snippet.summary) return null;
              return {
                id: item.evidence_id,
                text: snippet.summary,
                summary: snippet.summary,
                source: friendlySourceTitle(item.source_title),
                locator: humanizeLocator(item.locator),
                date: snippet.dateLabel ?? item.available_at?.slice(0, 10) ?? null,
              };
            })
            .filter((item): item is NonNullable<typeof item> => item !== null),
        ).slice(0, 8);

    const notes: string[] = sources.map((item) => `(${item.source}) ${item.text}`);
    if (PEOPLE_QUESTION.test(searchText)) {
      notes.push(
        `Company directory: ${directory
          .filter((person) => person.isActive)
          .map((person) => `${person.name} — ${personFacts(person).slice(0, 3).join("; ")}`)
          .join(" | ")}`,
      );
    }
    const findingRows = (findings.data ?? []) as Array<{ title: string; observed: string | null; polarity: string | null }>;
    if (findingRows.length) {
      notes.push(
        `Current brief: ${findingRows
          .map((finding) => `${finding.polarity === "positive" ? "Going well" : "Concern"}: ${finding.title}${finding.observed ? ` — ${finding.observed}` : ""}`)
          .join(" | ")}`,
      );
    }

    if (notes.length === 0) {
      return Response.json({
        answer: "None of the documents we have cover that yet.",
        sources: [],
        mode: "no_record",
      });
    }

    const citedSources = notes.map((note, index) => ({
      n: index + 1,
      ...(sources[index] ?? {
        id: `context-${index}`,
        summary: note.startsWith("Company directory") ? "Company directory (HR master)" : "Current morning brief",
        source: note.startsWith("Company directory") ? "Employee master" : "Morning brief",
        locator: "",
        date: null,
      }),
    }));

    try {
      const { text, model } = await generateWithFailover(
        `${history.length ? `Earlier in this conversation:\n${history.map((turn) => `CEO: ${turn.question}\nYou: ${turn.answer}`).join("\n")}\n\n` : ""}The CEO asks: "${question}"

Notes:
${notes.map((note, index) => `[${index + 1}] ${note}`).join("\n")}`,
        CEO_ASK_SYSTEM,
        { task: "chat", maxOutputTokens: 700, timeoutMs: 20_000 },
      );
      // Renumber citations 1..k in order of first use, so the CEO sees
      // [1] [2] [3], not the internal note numbers.
      const order = [...text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)]
        .flatMap((match) => match[1].split(",").map((n) => Number(n.trim())))
        .filter((n, index, all) => all.indexOf(n) === index && citedSources.some((source) => source.n === n));
      const renumber = new Map(order.map((n, index) => [n, index + 1]));
      const answer = text
        .trim()
        .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_match, list: string) => {
          const mapped = [...new Set(list.split(",").map((n) => renumber.get(Number(n.trim()))).filter(Boolean))];
          return mapped.length ? `[${mapped.join(", ")}]` : "";
        });
      return Response.json({
        answer,
        sources: order
          .map((n) => citedSources.find((source) => source.n === n)!)
          .map((source) => ({ ...source, n: renumber.get(source.n)! })),
        mode: "live",
        model,
      });
    } catch (error) {
      // Without the model, show what the records say rather than an error.
      console.error("Ask: model unavailable, returning stored extracts", error);
      return Response.json({
        answer:
          sources.length > 0
            ? "I can't put together a full answer right now, but here is what the records say on this."
            : "I can't answer that right now, and none of the documents we have cover it.",
        sources: citedSources.filter((source) => !String(source.id).startsWith("context-")),
        mode: "stored",
      });
    }
  } catch (error) {
    console.error("Ask failed", error);
    return Response.json({ error: "Unable to answer right now." }, { status: 502 });
  }
}
