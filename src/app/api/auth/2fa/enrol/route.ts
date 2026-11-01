import "server-only";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/rbac";
import { twoFactorService } from "@/services/auth/two-factor.service";

export async function POST() {
  try {
    const auth = await requireUser();
    if (auth.response) return auth.response;

    const user = auth.user;
    const result = await twoFactorService.startEnrolment(user);

    return NextResponse.json({
      success: true,
      data: {
        secret: result.secret,
        otpAuthUrl: result.otpAuthUrl,
        backupCodes: result.backupCodes,
      },
    });
  } catch (error) {
    console.error("[2FA Enrol] Error starting enrolment:", error);
    return NextResponse.json(
      { success: false, error: "Failed to initiate two-factor enrolment." },
      { status: 500 }
    );
  }
}

