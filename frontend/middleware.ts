import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/shared-calendar"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Let public assets and Next internals through
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/verify") ||
    pathname.startsWith("/payment") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  const hasSession =
    request.cookies.has("maia_refresh_token") ||
    request.cookies.has("maia_access_token");

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Not authenticated → send to login
  if (!hasSession && !isPublic) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // Already authenticated → visiting login or root redirects to dashboard
  // (but NOT /shared-calendar — that page is always accessible regardless of auth state)
  if (hasSession && (pathname === "/login" || pathname === "/")) {
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = "/dashboard";
    return NextResponse.redirect(dashUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
