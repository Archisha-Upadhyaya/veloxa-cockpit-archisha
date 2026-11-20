import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceGeminiKey,
  coolDownGeminiKey,
  geminiApiKeys,
  orderedGeminiKeys,
  resetGeminiKeyRotation,
} from "@/lib/ai/keys";
import { generateWithFailover } from "@/lib/ai/gemini";

const originalKeys = process.env.GEMINI_API_KEYS;
const originalKey = process.env.GEMINI_API_KEY;

beforeEach(() => {
  resetGeminiKeyRotation();
  delete process.env.GEMINI_API_KEYS;
  delete process.env.GEMINI_API_KEY;
});

afterEach(() => {
  resetGeminiKeyRotation();
  vi.unstubAllGlobals();
  if (originalKeys === undefined) delete process.env.GEMINI_API_KEYS;
  else process.env.GEMINI_API_KEYS = originalKeys;
  if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = originalKey;
});

describe("Gemini key rotation", () => {
  it("accepts any number of keys, separated by commas, semicolons or spaces", () => {
    process.env.GEMINI_API_KEYS = "one,two;three four\nfive,one";
    expect(geminiApiKeys()).toEqual(["one", "two", "three", "four", "five"]);
  });

  it("keeps the legacy single-key name working", () => {
    process.env.GEMINI_API_KEY = "legacy";
    expect(geminiApiKeys()).toEqual(["legacy"]);
  });

  it("starts with one key and moves to the next after a successful request", () => {
    process.env.GEMINI_API_KEYS = "a,b,c";
    expect(orderedGeminiKeys()).toEqual(["a", "b", "c"]);
    advanceGeminiKey();
    expect(orderedGeminiKeys()).toEqual(["b", "c", "a"]);
    advanceGeminiKey();
    expect(orderedGeminiKeys()).toEqual(["c", "a", "b"]);
  });

  it("skips a key that hit its quota, then returns it after the cooldown", () => {
    process.env.GEMINI_API_KEYS = "a,b";
    coolDownGeminiKey("a");
    expect(orderedGeminiKeys()).toEqual(["b"]);
    expect(orderedGeminiKeys(Date.now() + 61_000)).toEqual(["b", "a"]);
  });

  it("returns no keys when none are configured", () => {
    expect(geminiApiKeys()).toEqual([]);
    expect(orderedGeminiKeys()).toEqual([]);
  });

  it("moves to the next key when the first one is rate-limited", async () => {
    process.env.GEMINI_API_KEYS = "quota-key,working-key";
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(url);
        if (url.includes("quota-key")) {
          return new Response(JSON.stringify({ error: { message: "quota exceeded" } }), { status: 429 });
        }
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: "OK" }] } }] }),
          { status: 200 },
        );
      }),
    );

    const result = await generateWithFailover("Reply OK", "Reply OK", {
      task: "chat",
      maxOutputTokens: 10,
      timeoutMs: 1_000,
    });
    expect(result.text).toBe("OK");
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain("quota-key");
    expect(calls[1]).toContain("working-key");
  });
});
