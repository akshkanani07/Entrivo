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

// Preset rate limiters
export const loginRateLimiter = (ip: string) =>
  checkRateLimit(`login:${ip}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 }); // 5 attempts per 15 min

export const magicLinkRateLimiter = (email: string) =>
  checkRateLimit(`magic:${email}`, { maxRequests: 3, windowMs: 60 * 60 * 1000 }); // 3 requests per hour

export const registerRateLimiter = (ip: string) =>
  checkRateLimit(`register:${ip}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 }); // 10 per hour per IP
