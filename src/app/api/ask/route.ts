import { createServerSupabaseClient } from "@/lib/supabase/server";
import { asOfFromRequest } from "@/lib/time/as-of";
import { generateWithFailover } from "@/lib/ai/gemini";
import { CEO_ASK_SYSTEM } from "@/lib/ai/prompts";
import { embedTexts } from "@/lib/rag/embeddings";
import { retrieveEvidence, type RetrievedEvidence } from "@/lib/rag/retrieve";
import { keywordEvidenceSearch } from "@/lib/data/fallback";
import { loadDirectory, personFacts } from "@/lib/people/directory";
import { loadAnalysisEvidence } from "@/lib/analysis/evidence";
import { correctNames } from "@/lib/people/names";
import {
  dedupeEvidenceSummaries,
  extractEvidenceSnippet,
  friendlySourceTitle,
  humanizeLocator,
  isCompensationQuestion,
  isPrivateMessageRequest,
  isQuitRankingRequest,
  PRIVATE_MESSAGE_REFUSAL,
  COMPENSATION_REFUSAL,
  RETENTION_CHECK_FALLBACK,
  isSensitiveEvidence,
  redactSensitiveLines,
} from "@/lib/evidence/snippet";

type AskRequest = {
  question?: string;
  history?: Array<{ question: string; answer: string }>;
};

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
    const asOf = asOfFromRequest(request);
    if (!question) return Response.json({ error: "question is required" }, { status: 400 });
    const history = (body.history ?? []).slice(-4);

    if (isPrivateMessageRequest(question)) {
      return Response.json({ answer: PRIVATE_MESSAGE_REFUSAL, sources: [], mode: "policy" });
    }
    if (isQuitRankingRequest(question)) {
      // Answered from the saved retention check (work records only).
      const saved = await createServerSupabaseClient()
        .from("health_checks")
        .select("checked_at, areas")
        .eq("mode", "retention")
        .order("checked_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const flags = (saved.data?.areas ?? []) as Array<{ name: string; level: string; reasons: Array<{ text: string }> }>;
      return Response.json({
        answer: saved.data
          ? flags.length
            ? `From the last retention check (${new Date(saved.data.checked_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}), based only on work records: ${flags
                .map((flag) => `${flag.name}${flag.level === "urgent" ? " (urgent)" : ""}: ${flag.reasons.map((reason) => reason.text.replace(/[.\s]+$/, "")).join("; ")}`)
                .join(". ")}. These are reasons to check in, not predictions. Re-run it on the People page for a fresh view.`
            : "The last retention check found no one with a clear reason for a check-in. You can re-run it on the People page."
          : RETENTION_CHECK_FALLBACK,
        sources: [],
        mode: "policy",
      });
    }

    if (isCompensationQuestion(question)) {
      return Response.json({
        answer: COMPENSATION_REFUSAL,
        sources: [],
        mode: "policy",
      });
    }

    // Follow-ups like "and what about finance?" need the earlier question.
    const searchText = [history.at(-1)?.question, question].filter(Boolean).join(" ");
    const supabase = createServerSupabaseClient();
    const [records, directory, findings] = await Promise.all([
      loadAnalysisEvidence(supabase, asOf.at.toISOString()),
      loadDirectory(supabase, asOf.at),
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
    // The directory is always included (it is short): people come up in
    // most questions, often by first name, nickname or initials.
    if (directory.length) {
      notes.push(
        `Company directory: ${directory
          .filter((person) => person.isActive)
          .map((person) => `${person.name} — ${personFacts(person).slice(0, 3).join("; ")}`)
          .join(" | ")}`,
      );
    }
    // Things the CEO has reported that the records do not show yet.
    const reportedPeople = directory.filter((person) => person.reported);
    if (reportedPeople.length) {
      notes.push(
        `Reported by the CEO, not yet in the records: ${reportedPeople
          .map((person) => `${person.name} (${person.title}) — ${person.status}${person.exitDate ? `, expected exit around ${person.exitDate}` : ""}, reported ${person.reported!.reportedOn}${person.reported!.note ? `: ${person.reported!.note}` : ""}`)
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
        summary: note.startsWith("Company directory")
          ? "Company directory (HR master)"
          : note.startsWith("Reported by the CEO")
            ? "What you reported (not yet in the records)"
            : "Current morning brief",
        source: note.startsWith("Company directory")
          ? "Employee master"
          : note.startsWith("Reported by the CEO")
            ? "Reported by you"
            : "Morning brief",
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
      // Renumber citations 1..k in order of first use, one number per
      // document (several chunks of the same file share a citation), so the
      // CEO sees [1] [2] [3], not internal note numbers.
      const docKey = (n: number) => citedSources.find((source) => source.n === n)?.source ?? `#${n}`;
      const firstUse = [...text.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\]/g)]
        .flatMap((match) => match[1].split(",").map((n) => Number(n.trim())))
        .filter((n) => citedSources.some((source) => source.n === n));
      const docs = [...new Set(firstUse.map(docKey))];
      const numberOf = (n: number) => docs.indexOf(docKey(n)) + 1;
      const answer = correctNames(text, directory.map((person) => person.name.split(" ")[0]))
        .trim()
        .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_match, list: string) => {
          const mapped = [...new Set(list.split(",").map((n) => Number(n.trim())).filter((n) => firstUse.includes(n)).map(numberOf))]
            .sort((x, y) => x - y);
          return mapped.length ? `[${mapped.join(", ")}]` : "";
        });
      const order = docs.map((doc) => firstUse.find((n) => docKey(n) === doc)!);
      const renumber = new Map(order.map((n) => [n, numberOf(n)]));
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
