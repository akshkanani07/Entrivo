import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, revokeSession } from "@/lib/auth";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("entrivo_session_token")?.value;
    if (token) {
      const payload = verifyToken(token);
      if (payload?.sessionId) {
        await revokeSession(payload.sessionId);
      }
    }

    const response = NextResponse.json({ success: true, message: "Logged out successfully" });
    response.cookies.delete("entrivo_session_token");
    return response;
  } catch (error) {
    console.error("Logout error:", error);
    const response = NextResponse.json({ success: true, message: "Logged out" });
    response.cookies.delete("entrivo_session_token");
    return response;
  }
}
