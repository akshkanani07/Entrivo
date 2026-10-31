interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const entry = memoryStore.get(identifier);

  if (!entry || entry.resetAt <= now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    memoryStore.set(identifier, newEntry);
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: newEntry.resetAt,
    };
  }

  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  entry.count += 1;
  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// 5 attempts per 15 min by IP and by Email
export const loginRateLimiter = (ip: string, email?: string) => {
  const ipCheck = checkRateLimit(`login:ip:${ip}`, { maxRequests: 10, windowMs: 15 * 60 * 1000 });
  if (!ipCheck.allowed) return ipCheck;
  if (email) {
    const emailCheck = checkRateLimit(`login:email:${email.toLowerCase().trim()}`, {
      maxRequests: 5,
      windowMs: 15 * 60 * 1000,
    });
    if (!emailCheck.allowed) return emailCheck;
  }
  return ipCheck;
};

// 3 requests per 15 min by IP and by Email
export const magicLinkRateLimiter = (ip: string, email: string) => {
  const ipCheck = checkRateLimit(`magic:ip:${ip}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 });
  if (!ipCheck.allowed) return ipCheck;
  const emailCheck = checkRateLimit(`magic:email:${email.toLowerCase().trim()}`, {
    maxRequests: 3,
    windowMs: 15 * 60 * 1000,
  });
  return emailCheck;
};

// 3 requests per 15 min by IP and by Email
export const forgotPasswordRateLimiter = (ip: string, email: string) => {
  const ipCheck = checkRateLimit(`forgot:ip:${ip}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 });
  if (!ipCheck.allowed) return ipCheck;
  const emailCheck = checkRateLimit(`forgot:email:${email.toLowerCase().trim()}`, {
    maxRequests: 3,
    windowMs: 15 * 60 * 1000,
  });
  return emailCheck;
};

export const registerRateLimiter = (ip: string) =>
  checkRateLimit(`register:${ip}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 });
