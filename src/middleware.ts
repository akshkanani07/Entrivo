import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Helper to check if JWT token is expired without external node dependencies
function isJwtExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return true;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    const payload = JSON.parse(jsonPayload);
    if (!payload.exp) return false;
    return Date.now() >= payload.exp * 1000;
  } catch {
    return true;
  }
}

// Exact or segment match: "/pass" matches "/pass" or "/pass/123", but NOT "/password"
function matchesRouteSegment(pathname: string, route: string): boolean {
  if (pathname === route) return true;
  if (pathname.startsWith(route + "/")) return true;
  return false;
}

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/magic-link",
  "/terms",
  "/privacy",
  "/forbidden",
  "/pass",
  "/kiosk",
  "/manifest.json",
  "/sw.js",
  "/icons",
  // Public auth API handlers only:
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/google",
  "/api/auth/magic-link",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  // Cron endpoints (manage their own Bearer CRON_SECRET auth):
  "/api/cron",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get("entrivo_session_token")?.value;

  const isPublic = PUBLIC_ROUTES.some((route) => matchesRouteSegment(pathname, route));
  const isTokenExpired = sessionToken ? isJwtExpired(sessionToken) : true;
  const hasValidToken = Boolean(sessionToken && !isTokenExpired);

  // If user is accessing a protected route without a valid token
  if (!hasValidToken && !isPublic) {
    // If it's an API route, return 401 JSON instead of redirecting to login page
    if (pathname.startsWith("/api/")) {
      const response = NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      );
      if (sessionToken) {
        response.cookies.delete("entrivo_session_token");
      }
      return response;
    }

    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(loginUrl);
    if (sessionToken) {
      response.cookies.delete("entrivo_session_token");
    }
    return response;
  }

  // If token is expired on any request, clear it
  if (sessionToken && isTokenExpired) {
    const response = NextResponse.next();
    response.cookies.delete("entrivo_session_token");
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files with extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
