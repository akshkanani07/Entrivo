import "server-only";
import { NextResponse } from "next/server";
import crypto from "crypto";
import { storage } from "@/services/storage";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get("key");
    const expStr = searchParams.get("exp");
    const sig = searchParams.get("sig");

    if (!key || !expStr || !sig) {
      return NextResponse.json(
        { success: false, error: "Missing required signature parameters" },
        { status: 400 }
      );
    }

    const exp = parseInt(expStr, 10);
    if (isNaN(exp) || Math.floor(Date.now() / 1000) > exp) {
      return NextResponse.json(
        { success: false, error: "Download link has expired" },
        { status: 403 }
      );
    }

    const secret = process.env.JWT_SECRET || "entrivo-local-storage-secret";
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(`${key}:${exp}`)
      .digest("hex")
      .slice(0, 32);

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return NextResponse.json(
        { success: false, error: "Invalid cryptographic download signature" },
        { status: 403 }
      );
    }

    const stored = await storage.get(key);
    if (!stored) {
      return NextResponse.json(
        { success: false, error: "File not found" },
        { status: 404 }
      );
    }

    return new NextResponse(stored.buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": stored.mime,
        "Content-Length": stored.buffer.length.toString(),
        "Content-Disposition": `inline; filename="download.${stored.mime.split("/")[1] || "bin"}"`,
        "Cache-Control": "private, no-transform, max-age=60",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("[FileDownload] Signed download error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to download file" },
      { status: 500 }
    );
  }
}

