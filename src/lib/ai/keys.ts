/**
 * Gemini API key rotation.
 *
 * `GEMINI_API_KEYS` accepts one or more keys separated by commas, semicolons
 * or whitespace. `GEMINI_API_KEY` remains supported as a single-key fallback,
 * so existing deployments keep working.
 *
 * Requests start at the next key in the list. A key that reports a quota or
 * authentication failure is put on a short cooldown and the request moves to
 * the next key. When every key is cooling down we still try them in order,
 * because a cooldown may have expired or the provider may have recovered.
 */

let cursor = 0;
const cooldowns = new Map<string, number>();

function configuredKeys() {
  const raw = [process.env.GEMINI_API_KEYS, process.env.GEMINI_API_KEY]
    .filter(Boolean)
    .join(",");
  return [...new Set(raw.split(/[\s,;]+/).map((key) => key.trim()).filter(Boolean))];
}

export function geminiApiKeys() {
  return configuredKeys();
}

export function hasGeminiApiKey() {
  return configuredKeys().length > 0;
}

/** Keys in rotation order, preferring ones that are not cooling down. */
export function orderedGeminiKeys(now = Date.now()) {
  const keys = configuredKeys();
  if (keys.length === 0) return [];
  const start = cursor % keys.length;
  const rotated = [...keys.slice(start), ...keys.slice(0, start)];
  const available = rotated.filter((key) => (cooldowns.get(key) ?? 0) <= now);
  return available.length > 0 ? available : rotated;
}

/** Move the starting point on after a successful request, spreading load. */
export function advanceGeminiKey() {
  cursor += 1;
}

/** A key hit its quota or was rejected: skip it for a minute. */
export function coolDownGeminiKey(key: string, milliseconds = 60_000) {
  cooldowns.set(key, Date.now() + milliseconds);
  cursor += 1;
}

/** Test hook; not used by the application. */
export function resetGeminiKeyRotation() {
  cursor = 0;
  cooldowns.clear();
}
