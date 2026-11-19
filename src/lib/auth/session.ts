/**
 * Minimal sign-in: one set of credentials from the environment, and a
 * signed, HTTP-only session cookie. Uses Web Crypto so it works in the proxy
 * and in route handlers alike.
 */
export const SESSION_COOKIE = "veloxa_session";
const SESSION_HOURS = 12;

// Demo defaults, documented in the README. Override in production.
export const credentials = () => ({
  username: process.env.VELOXA_USERNAME || "ceo",
  password: process.env.VELOXA_PASSWORD || "veloxa-brief",
});

/** Secret for signing sessions (and the bearer token for trusted jobs). */
export function sessionSecret() {
  const { username, password } = credentials();
  return process.env.VELOXA_SESSION_SECRET || `veloxa-local-secret:${username}:${password}`;
}

const encoder = new TextEncoder();
const toHex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function sign(value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(sessionSecret()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

/** Constant-time comparison of two strings. */
export function safeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export async function createSession(username: string) {
  const expires = Date.now() + SESSION_HOURS * 3_600_000;
  const value = `${encodeURIComponent(username)}.${expires}`;
  return { value: `${value}.${await sign(value)}`, maxAge: SESSION_HOURS * 3600 };
}

export async function verifySession(token: string | undefined | null) {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [user, expires, signature] = parts;
  if (!/^\d+$/.test(expires) || Number(expires) < Date.now()) return false;
  return safeEqual(signature, await sign(`${user}.${expires}`));
}
