import { embedTexts } from "@/lib/rag/embeddings";
import { retrieveEvidence, type RetrievedEvidence } from "@/lib/rag/retrieve";
import { keywordEvidenceSearch } from "@/lib/data/fallback";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  dedupeEvidenceSummaries,
  extractEvidenceSnippet,
  friendlySourceTitle,
  humanizeLocator,
  isSensitiveEvidence,
} from "@/lib/evidence/snippet";

type RetrieveRequest = {
  query?: string;
  asOf?: string;
  threshold?: number;
  limit?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RetrieveRequest;
    const query = body.query?.trim();
    if (!query) {
      return Response.json({ error: "query is required" }, { status: 400 });
    }

    let evidence: RetrievedEvidence[] = [];
    let mode: "semantic" | "stored_keyword" = "semantic";
    try {
      const [queryEmbedding] = await embedTexts([query], "RETRIEVAL_QUERY");
      if (!queryEmbedding) {
        throw new Error("Embedding provider returned no query embedding.");
      }
      evidence = await retrieveEvidence(queryEmbedding, {
        asOf: body.asOf,
        limit: body.limit,
        threshold: body.threshold,
      });
    } catch (error) {
      console.error("Semantic retrieval unavailable; searching stored evidence", error);
      mode = "stored_keyword";
    }
    if (evidence.length === 0) {
      const stored = await keywordEvidenceSearch(createServerSupabaseClient(), query, {
        asOf: body.asOf,
        limit: body.limit,
      });
      if (stored.length > 0) {
        evidence = stored;
        mode = "stored_keyword";
      }
    }

    const seen = new Set<string>();
    const snippets = evidence
      .map((item) => {
        const rawText = item.evidence_text ?? item.quoted_text ?? "";
        if (!rawText || isSensitiveEvidence(rawText)) return null;
        const snippet = extractEvidenceSnippet(rawText, {
          context: query,
          sourceTitle: item.source_title,
          locator: item.locator,
        });
        if (snippet.sensitive || !snippet.summary) return null;
        if (seen.has(snippet.summary)) return null;
        seen.add(snippet.summary);
        return {
          evidence_id: item.evidence_id,
          summary: snippet.summary,
          source_title: friendlySourceTitle(item.source_title),
          locator: humanizeLocator(item.locator),
          kind: snippet.kind,
          dateLabel:
            snippet.dateLabel ?? item.available_at?.slice(0, 10) ?? undefined,
          similarity: item.similarity,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return Response.json({
      query,
      mode,
      evidence: dedupeEvidenceSummaries(snippets).slice(0, 6),
    });
  } catch (error) {
    console.error("RAG evidence retrieval failed", error);
    return Response.json(
      { error: "Unable to retrieve evidence." },
      { status: 502 },
    );
  }
}
