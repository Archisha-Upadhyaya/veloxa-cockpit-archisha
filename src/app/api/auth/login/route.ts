import { SESSION_COOKIE, createSession, credentials, safeEqual } from "@/lib/auth/session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { username?: string; password?: string };
  const expected = credentials();
  const ok =
    safeEqual((body.username ?? "").trim().toLowerCase(), expected.username.toLowerCase()) &&
    safeEqual(body.password ?? "", expected.password);
  if (!ok) {
    // A short pause makes guessing slower.
    await new Promise((resolve) => setTimeout(resolve, 600));
    return Response.json({ error: "That username and password don't match." }, { status: 401 });
  }
  const session = await createSession(expected.username);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      "content-type": "application/json",
      "set-cookie": `${SESSION_COOKIE}=${session.value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${session.maxAge}${secure}`,
    },
  });
}
