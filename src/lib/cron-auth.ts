import crypto from "crypto";

/**
 * Validates the Authorization: Bearer ${CRON_SECRET} header using a constant-time comparison
 * to eliminate timing attack vectors.
 */
export function verifyCronSecret(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || cronSecret.trim() === "") {
    console.warn("CRON_SECRET environment variable is not configured. Rejecting cron request.");
    return false;
  }

  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return false;
  }

  const providedToken = match[1].trim();

  try {
    const tokenBuffer = Buffer.from(providedToken, "utf8");
    const secretBuffer = Buffer.from(cronSecret.trim(), "utf8");

    if (tokenBuffer.length !== secretBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(tokenBuffer, secretBuffer);
  } catch {
    return false;
  }
}

