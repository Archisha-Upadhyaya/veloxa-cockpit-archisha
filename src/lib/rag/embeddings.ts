const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIMENSIONS = 1536;
const GEMINI_BATCH_SIZE = 16;

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

const LOCAL_STOP_WORDS = new Set([
  "the", "and", "for", "from", "with", "that", "this", "these", "those",
  "into", "over", "under", "about", "after", "before", "between", "during",
  "there", "their", "they", "them", "have", "has", "had", "was", "were",
  "will", "would", "could", "should", "can", "may", "might", "must", "not",
  "but", "while", "when", "where", "what", "which", "who", "whom", "whose",
  "why", "how", "all", "any", "each", "more", "most", "some", "such", "than",
  "then", "too", "very", "just", "also", "only", "own", "same", "our", "your",
  "its", "his", "her", "him", "she", "he", "you", "me", "my", "we", "us",
  "is", "are", "be", "been", "being", "do", "does", "did", "done", "get",
  "got", "make", "made", "use", "used", "see", "seen", "say", "said",
]);

const LOCAL_SYNONYMS: Record<string, string[]> = {
  hire: ["hiring", "recruit", "recruiting", "role", "vacancy", "headcount"],
  hiring: ["hire", "recruit", "recruiting", "role", "vacancy", "headcount"],
  recruit: ["hiring", "hire", "candidate", "offer", "requisition"],
  depart: ["departure", "resign", "resignation", "notice", "exit", "leaving"],
  departure: ["resign", "resignation", "notice", "exit", "leaving"],
  resign: ["resignation", "notice", "departure", "exit", "leaving"],
  salary: ["pay", "compensation", "payslip", "ctc", "payroll"],
  payroll: ["salary", "pay", "compensation", "payslip"],
  leave: ["absence", "timeoff", "vacation", "sick"],
  absence: ["leave", "timeoff", "sick"],
  capacity: ["workload", "bandwidth", "overload", "staffing", "headcount"],
  workload: ["capacity", "bandwidth", "overload", "busy"],
  risk: ["concern", "issue", "problem", "control", "weakness"],
  launch: ["release", "ga", "delivery", "ship", "milestone"],
  incident: ["outage", "reliability", "bug", "severity", "postmortem"],
  finance: ["ledger", "burn", "expense", "invoice", "cost", "budget", "runway"],
  marketing: ["campaign", "event", "summit", "lead", "spend", "brand"],
};

function localTokens(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !LOCAL_STOP_WORDS.has(token));
}

function hashFeature(value: string) {
  // FNV-1a, 32-bit. Stable across runs and machines.
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic local embedding used when no Gemini key is configured (for
 * example in an offline Docker instance). It is not a semantic model, but it
 * makes keyword-adjacent retrieval work without an external dependency.
 */
export function localEmbedding(text: string): number[] {
  const tokens = localTokens(text);
  const features = new Map<string, number>();
  const add = (feature: string, weight: number) => {
    features.set(feature, (features.get(feature) ?? 0) + weight);
  };
  for (const token of tokens) {
    add(token, 1);
    for (const synonym of LOCAL_SYNONYMS[token] ?? []) add(synonym, 0.6);
  }
  for (let index = 0; index < tokens.length - 1; index += 1) {
    add(`${tokens[index]} ${tokens[index + 1]}`, 1.4);
  }

  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  for (const [feature, count] of features) {
    const hash = hashFeature(feature);
    const bucket = hash % EMBEDDING_DIMENSIONS;
    const sign = hash & 1 ? 1 : -1;
    vector[bucket] += sign * (1 + Math.log1p(count));
  }
  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    vector[hashFeature(text) % EMBEDDING_DIMENSIONS] = 1;
    return vector;
  }
  return vector.map((value) => value / magnitude);
}

export function embeddingsProvider(): "gemini" | "local" {
  const configured = process.env.EMBEDDINGS_PROVIDER?.toLowerCase();
  if (configured === "local" || configured === "gemini") return configured;
  return process.env.GEMINI_API_KEY ? "gemini" : "local";
}

/**
 * The local provider produces much lower cosine scores than Gemini. Routes use
 * this to avoid silently returning nothing in a Docker instance.
 */
export function defaultMatchThreshold() {
  return embeddingsProvider() === "local" ? 0.08 : 0.72;
}

async function embedWithGemini(texts: string[], taskType: EmbeddingTask) {
  const model = process.env.EMBEDDINGS_MODEL ?? DEFAULT_EMBEDDING_MODEL;
  const embeddings: number[][] = [];
  for (let start = 0; start < texts.length; start += GEMINI_BATCH_SIZE) {
    const batch = texts.slice(start, start + GEMINI_BATCH_SIZE);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents?key=${encodeURIComponent(required("GEMINI_API_KEY"))}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          requests: batch.map((text) => ({
            model: `models/${model}`,
            content: { parts: [{ text }] },
            taskType,
            outputDimensionality: EMBEDDING_DIMENSIONS,
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

    const batchEmbeddings = payload.embeddings?.map((item) => item.values);
    if (!batchEmbeddings || batchEmbeddings.some((embedding) => !embedding)) {
      throw new Error("Gemini returned an invalid embedding response.");
    }
    if (batchEmbeddings.some((embedding) => embedding!.length !== EMBEDDING_DIMENSIONS)) {
      throw new Error(
        "Embedding dimensions do not match the database vector(1536) column.",
      );
    }
    embeddings.push(...(batchEmbeddings as number[][]));
  }
  return embeddings;
}

export async function embedTexts(
  texts: string[],
  taskType: EmbeddingTask = "RETRIEVAL_DOCUMENT",
) {
  if (texts.length === 0) return [];
  if (embeddingsProvider() === "local") {
    return texts.map((text) => localEmbedding(text));
  }
  return embedWithGemini(texts, taskType);
}
