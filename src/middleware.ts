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

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get("entrivo_session_token")?.value;

  const publicRoutes = [
    "/login",
    "/register",
    "/forgot-password",
    "/pass",
    "/api/auth",
    "/kiosk",
    "/manifest.json",
    "/sw.js",
  ];
  const isPublic = publicRoutes.some((route) => pathname.startsWith(route));

  const isTokenExpired = sessionToken ? isJwtExpired(sessionToken) : true;
  const hasValidToken = Boolean(sessionToken && !isTokenExpired);

  // If user is accessing a protected route without a valid token
  if (!hasValidToken && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    const response = NextResponse.redirect(loginUrl);
    if (sessionToken) {
      // Clear expired or malformed token cookie
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
