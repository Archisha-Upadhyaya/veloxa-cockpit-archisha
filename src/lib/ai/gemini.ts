import { GROUNDED_ANSWER_SYSTEM } from "@/lib/ai/prompts";

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
};

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export async function generateGroundedAnswer(
  prompt: string,
  systemInstruction = GROUNDED_ANSWER_SYSTEM,
  options: { maxOutputTokens?: number; timeoutMs?: number } = {},
) {
  const model = process.env.GEMINI_CHAT_MODEL ?? "gemini-3.8-flash";
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.timeoutMs ?? 12_000,
  );
  let response: Response;

  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(required("GEMINI_API_KEY"))}`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: {
          parts: [
            {
              text: systemInstruction,
            },
          ],
        },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: options.maxOutputTokens ?? 320,
        },
      }),
        signal: controller.signal,
      },
    );
  } finally {
    clearTimeout(timeout);
  }
  const payload = (await response.json()) as GeminiResponse;
  if (!response.ok) {
    throw new Error(`Gemini answer failed: ${payload.error?.message ?? response.statusText}`);
  }
  const answer = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join(" ");
  if (!answer) throw new Error("Gemini returned no answer.");
  return answer;
}
