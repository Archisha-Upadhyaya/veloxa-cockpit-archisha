import { embedTexts } from "@/lib/rag/embeddings";
import { retrieveEvidence } from "@/lib/rag/retrieve";

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

    const [queryEmbedding] = await embedTexts([query], "RETRIEVAL_QUERY");
    if (!queryEmbedding) {
      throw new Error("Embedding provider returned no query embedding.");
    }
    const evidence = await retrieveEvidence(queryEmbedding, {
      asOf: body.asOf,
      limit: body.limit,
      threshold: body.threshold,
    });
    return Response.json({ query, evidence });
  } catch (error) {
    console.error("RAG evidence retrieval failed", error);
    return Response.json(
      { error: "Unable to retrieve evidence." },
      { status: 502 },
    );
  }
}
