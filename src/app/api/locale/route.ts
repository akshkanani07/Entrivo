import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getClientIp, getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";
import { LOCALE_COOKIE_NAME, SUPPORTED_LOCALES } from "@/i18n/locale";
import { audit } from "@/services/audit/audit.service";

const localeSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES),
});

export async function POST(request: Request) {
  const translations = await getTranslations("errors");
  const ipAddress = getClientIp(request.headers);
  const rateLimit = checkRateLimit(`locale-change:${ipAddress}`, {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
  });

  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        code: "RATE_LIMITED",
        message: translations("rateLimited"),
      },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }

  const parsed = localeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        code: "INVALID_LOCALE",
        message: translations("invalidLocale"),
      },
      { status: 400 }
    );
  }

  const user = await getCurrentUser();
  if (user?.locale !== parsed.data.locale) {
    if (user?.organizationId) {
      const updated = await prisma.user.updateMany({
        where: { id: user.id, organizationId: user.organizationId },
        data: { locale: parsed.data.locale },
      });
      if (updated.count !== 1) {
        return NextResponse.json(
          {
            success: false,
            code: "USER_NOT_FOUND",
            message: translations("preferenceSaveFailed"),
          },
          { status: 404 }
        );
      }
    } else if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: { locale: parsed.data.locale },
      });
    }

    if (user) {
      await audit({
        organizationId: user.organizationId,
        userId: user.id,
        action: "LOCALE_CHANGED",
        entity: "User",
        entityId: user.id,
        details: { locale: parsed.data.locale },
        ipAddress,
        userAgent: request.headers.get("user-agent"),
      });
    }
  }

  const response = NextResponse.json({ success: true, locale: parsed.data.locale });
  response.cookies.set(LOCALE_COOKIE_NAME, parsed.data.locale, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return response;
}
