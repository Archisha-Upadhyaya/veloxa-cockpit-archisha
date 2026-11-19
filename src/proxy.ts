import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, safeEqual, sessionSecret, verifySession } from "@/lib/auth/session";

/**
 * Everything requires sign-in. Pages redirect to /login (and come back after);
 * APIs answer 401. Trusted server jobs (the Docker bootstrap) may instead send
 * "Authorization: Bearer <VELOXA_SESSION_SECRET>".
 */
export async function proxy(request: NextRequest) {
  if (await verifySession(request.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer && safeEqual(bearer, sessionSecret())) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login page, the sign-in API, Next's own assets and
  // the site icon.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|icon\\.svg|favicon\\.ico).*)"],
};
