import { GROUNDED_ANSWER_SYSTEM } from "@/lib/ai/prompts";
import {
  advanceGeminiKey,
  coolDownGeminiKey,
  geminiApiKeys,
  orderedGeminiKeys,
} from "@/lib/ai/keys";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  error?: { code?: number; message?: string; status?: string };
};

/**
 * Model chains per task, tried in order. Verified against the project key on
 * 2026-11-18:
 *   gemini-3.8-flash / 3.5-flash  → listed but frequently 503 (high demand);
 *                                   3.5 also timed out, so it is not chained
 *   gemini-3-flash-preview        → available, stronger than lite; analysis fallback
 *   gemini-3.1-flash-lite         → reliably available, ~1.5s
 *   pro / gemini-4-* / 3.7-flash  → 429, not in this key's quota
 *   gemini-2.5-*                  → 404, retired for new keys
 * Concern analysis prefers the strongest model and can wait; chat prefers the
 * fastest. Both fall through to the model that is reliably up. Override with
 * GEMINI_ANALYSIS_MODELS / GEMINI_CHAT_MODELS (comma-separated).
 */
const DEFAULT_CHAINS = {
  analysis: ["gemini-3.8-flash", "gemini-3-flash-preview", "gemini-3.1-flash-lite", "gemini-flash-lite-latest"],
  chat: ["gemini-3.1-flash-lite", "gemini-flash-lite-latest", "gemini-3.8-flash"],
} as const;

export type ModelTask = keyof typeof DEFAULT_CHAINS;

export function modelChain(task: ModelTask): string[] {
  const envName = task === "analysis" ? "GEMINI_ANALYSIS_MODELS" : "GEMINI_CHAT_MODELS";
  const configured = process.env[envName]
    ?.split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  // GEMINI_CHAT_MODEL is the legacy single-model setting; keep honouring it
  // as the first choice, with the defaults behind it as failover.
  const legacy = process.env.GEMINI_CHAT_MODEL?.trim();
  const chain = configured?.length
    ? configured
    : [...(legacy ? [legacy] : []), ...DEFAULT_CHAINS[task]];
  return [...new Set(chain)];
}

class ModelError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    /** True when another key may succeed (quota, invalid or revoked key). */
    readonly keyFailure = false,
  ) {
    super(message);
  }
}

async function callModel(
  model: string,
  apiKey: string,
  prompt: string,
  systemInstruction: string,
  options: { maxOutputTokens: number; timeoutMs: number; json: boolean; schema?: object },
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemInstruction }] },
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.15,
            maxOutputTokens: options.maxOutputTokens,
            ...(options.json || options.schema ? { responseMimeType: "application/json" } : {}),
            // Structured output: the API guarantees JSON of this shape.
            ...(options.schema ? { responseSchema: options.schema } : {}),
          },
        }),
        signal: controller.signal,
      },
    );
  } catch (error) {
    throw new ModelError(
      `${model}: ${error instanceof Error && error.name === "AbortError" ? "timed out" : String(error)}`,
      true,
    );
  } finally {
    clearTimeout(timeout);
  }
  const payload = (await response.json().catch(() => ({}))) as GeminiResponse;
  if (!response.ok) {
    const message = payload.error?.message ?? response.statusText;
    // 400 is normally a malformed request and will fail on every key. Google
    // also uses 400 for an invalid/expired key, so treat that as key-level.
    const invalidKey = response.status === 400 && /api key|key not valid|invalid key|expired/i.test(message);
    // 401/403/429 are key-level failures: move to the next key. 404 (retired
    // model) and 5xx (overload) are model-level: move to the next model.
    const keyFailure = [401, 403, 429].includes(response.status) || invalidKey;
    throw new ModelError(
      `${model}: ${response.status} ${message}`,
      response.status !== 400 || invalidKey,
      keyFailure,
    );
  }
  const answer = payload.candidates?.[0]?.content?.parts
    ?.filter((part) => !part.thought)
    .map((part) => part.text)
    .filter(Boolean)
    .join(" ");
  if (!answer) {
    throw new ModelError(
      `${model}: no answer (${payload.candidates?.[0]?.finishReason ?? "empty"})`,
      true,
    );
  }
  return answer;
}

export async function generateWithFailover(
  prompt: string,
  systemInstruction = GROUNDED_ANSWER_SYSTEM,
  options: {
    task?: ModelTask;
    maxOutputTokens?: number;
    timeoutMs?: number;
    json?: boolean;
    /** Gemini response schema (OpenAPI subset) for guaranteed-shape JSON. */
    schema?: object;
    /** Optional check on the text; a failure moves on to the next model. */
    validate?: (text: string) => boolean;
  } = {},
) {
  if (geminiApiKeys().length === 0) {
    throw new Error("Missing GEMINI_API_KEYS (or GEMINI_API_KEY).");
  }
  const failures: string[] = [];
  for (const model of modelChain(options.task ?? "chat")) {
    // Re-read the rotation for each model: keys that failed on the previous
    // model are already cooling down.
    for (const apiKey of orderedGeminiKeys()) {
      try {
        const text = await callModel(model, apiKey, prompt, systemInstruction, {
          maxOutputTokens: options.maxOutputTokens ?? 320,
          timeoutMs: options.timeoutMs ?? 12_000,
          json: options.json ?? false,
          schema: options.schema,
        });
        if (options.validate && !options.validate(text)) {
          throw new ModelError(`${model}: response failed validation`, true);
        }
        advanceGeminiKey();
        if (failures.length > 0) {
          console.warn(`Gemini failover used ${model} after: ${failures.join("; ")}`);
        }
        return { text, model };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(message);
        if (error instanceof ModelError) {
          if (error.keyFailure) {
            coolDownGeminiKey(apiKey);
            continue;
          }
          // A model-level failure will repeat on every key: move to the next
          // model. A non-retryable 400 stops the chain.
          if (error.retryable) break;
          throw error;
        }
        // Network errors and timeouts are model-level too.
        break;
      }
    }
  }
  throw new Error(`Gemini answer failed on every model: ${failures.join("; ")}`);
}

export async function generateGroundedAnswer(
  prompt: string,
  systemInstruction = GROUNDED_ANSWER_SYSTEM,
  options: {
    task?: ModelTask;
    maxOutputTokens?: number;
    timeoutMs?: number;
    json?: boolean;
    schema?: object;
  } = {},
) {
  return (await generateWithFailover(prompt, systemInstruction, options)).text;
}
