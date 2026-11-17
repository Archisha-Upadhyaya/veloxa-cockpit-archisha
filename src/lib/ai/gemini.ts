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
  systemInstruction = "You are a grounded employee context assistant. Answer only from the supplied records. Never invent current work, opinions, dates, or commitments. If the records do not answer the question, say exactly what is unknown and name the missing record type. Keep answers to 2-4 concise sentences.",
) {
  const model = process.env.GEMINI_CHAT_MODEL ?? "gemini-3.8-flash";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
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
        generationConfig: { temperature: 0.1, maxOutputTokens: 220 },
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
