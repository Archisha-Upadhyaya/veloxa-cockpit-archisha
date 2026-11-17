const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";

type GeminiEmbeddingResponse = {
  embeddings?: Array<{ values?: number[] }>;
  error?: { message?: string };
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

export async function embedTexts(
  texts: string[],
  taskType: EmbeddingTask = "RETRIEVAL_DOCUMENT",
) {
  if (texts.length === 0) return [];

  const model = process.env.EMBEDDINGS_MODEL ?? DEFAULT_EMBEDDING_MODEL;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${encodeURIComponent(required("GEMINI_API_KEY"))}`,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      requests: texts.map((text) => ({
        model: `models/${model}`,
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: 1536,
      })),
    }),
    },
  );

  const payload = (await response.json()) as GeminiEmbeddingResponse;
  if (!response.ok) {
    throw new Error(
      `Gemini embedding request failed: ${
        payload.error?.message ?? response.statusText
      }`,
    );
  }

  const embeddings = payload.embeddings?.map((item) => item.values);
  if (!embeddings || embeddings.some((embedding) => !embedding)) {
    throw new Error("Gemini returned an invalid embedding response.");
  }
  if (embeddings.some((embedding) => embedding!.length !== 1536)) {
    throw new Error(
      "Embedding dimensions do not match the database vector(1536) column.",
    );
  }
  return embeddings as number[][];
}
