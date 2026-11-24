import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Edge-compatible JWT signature and expiration verification using jose
async function isSessionTokenValid(token: string): Promise<boolean> {
  const secret = process.env.JWT_SECRET;
  if (!secret) return false;
  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (!payload.exp) return false;
    return Date.now() < payload.exp * 1000;
  } catch {
    return false;
  }
}

// Exact or segment match: "/pass" matches "/pass" or "/pass/123", but NOT "/password"
function matchesRouteSegment(pathname: string, route: string): boolean {
  if (pathname === route) return true;
  if (pathname.startsWith(route + "/")) return true;
  return false;
}

function sanitizeCallbackUrl(urlPath: string): string {
  if (!urlPath.startsWith("/") || urlPath.startsWith("//") || urlPath.includes("\\")) {
    return "/";
  }
  return urlPath;
}

const PUBLIC_ROUTES = [
  "/login",
  "/register",
  "/forgot-password",
  "/reset-password",
  "/magic-link",
  "/verify-email",
  "/terms",
  "/privacy",
  "/forbidden",
  "/pass",
  "/preregister",
  "/self-checkin",
  "/kiosk",
  "/offline",
  "/developers",
  "/manifest.json",
  "/sw.js",
  "/icons",
  // Public API v1 & health check:
  "/api/v1",
  "/api/public/preregister",
  "/api/public/self-checkin",
  "/api/health",
  // Public auth API handlers only:
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/google",
  "/api/auth/magic-link",
  "/api/auth/forgot-password",
  "/api/auth/reset-password",
  "/api/auth/verify-email",
  "/api/auth/resend-verification",
  "/api/auth/2fa/verify",
  // Signed URL file download:
  "/api/files/download",
  // Cron endpoints (manage their own Bearer CRON_SECRET auth):
  "/api/cron",
  // Kiosk endpoints authenticate via x-kiosk-key header (no staff session):
  "/api/kiosk",
  // accept-terms is authenticated but not guarded by middleware (layout enforces):
  "/accept-terms",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get("entrivo_session_token")?.value;

  const isPublic = PUBLIC_ROUTES.some((route) => matchesRouteSegment(pathname, route));
  const hasValidToken = sessionToken ? await isSessionTokenValid(sessionToken) : false;

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
    const targetPath = request.nextUrl.pathname + request.nextUrl.search;
    loginUrl.searchParams.set("callbackUrl", sanitizeCallbackUrl(targetPath));
    const response = NextResponse.redirect(loginUrl);
    if (sessionToken) {
      response.cookies.delete("entrivo_session_token");
    }
    return response;
  }

  // If token is invalid on any request, clear it
  if (sessionToken && !hasValidToken) {
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
