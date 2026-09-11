import { NextResponse, type NextRequest } from "next/server";

const PROTECTED_PREFIXES = ["/home", "/meals", "/activity", "/friends", "/more", "/onboarding", "/feed", "/play", "/wardrobe", "/collection", "/cemetery", "/shop", "/pension", "/coach"];
const GUEST_ONLY = new Set(["/login", "/signup"]);

/** Better Auth session cookie names (secure prefix is used over HTTPS). */
const SESSION_COOKIES = ["__Secure-better-auth.session_token", "better-auth.session_token"];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => Boolean(request.cookies.get(name)?.value));
}

/**
 * Optimistic redirects based on the presence of the session cookie. Real
 * authorisation happens server-side in layouts and API routes.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = hasSessionCookie(request);

  if (!signedIn && PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/home" ? "" : `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (signedIn && GUEST_ONLY.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/home";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/home/:path*",
    "/meals/:path*",
    "/activity/:path*",
    "/friends/:path*",
    "/more/:path*",
    "/feed/:path*",
    "/play/:path*",
    "/wardrobe/:path*",
    "/collection/:path*",
    "/cemetery/:path*",
    "/shop/:path*",
    "/pension/:path*",
    "/coach/:path*",
    "/onboarding",
    "/login",
    "/signup",
  ],
};
