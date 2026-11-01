import { NextResponse } from "next/server";
import { checkExpiringDocuments } from "@/services/documents/document.service";

function verifyCronSecret(request: Request): boolean {
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const secret = process.env.CRON_SECRET;

  if (!secret) return false;
  return token === secret;
}

export async function GET(request: Request) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await checkExpiringDocuments();
    return NextResponse.json({
      success: true,
      message: "Document expiry lifecycle job completed successfully.",
      stats,
    });
  } catch (error: any) {
    console.error("[Cron Document Expiry] Execution failure:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process document expiries" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return GET(request);
}

