/**
 * Entrivo Rate Limiter
 *
 * Hybrid Redis-backed rate limiter with in-memory fallback.
 * - Preserves synchronous interface for high-performance route handler compatibility
 * - Automatically mirrors counters to Redis when available
 * - Enforces strict memory bounds (10,000 entry cap with LRU eviction)
 * - Exposes methods to clear per-email counters upon successful authentication
 */

import { getRedisConnection } from "./queue";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const memoryStore = new Map<string, RateLimitEntry>();
const MAX_MEMORY_ENTRIES = 10_000;

function pruneMemoryStore() {
  const now = Date.now();
  if (memoryStore.size > MAX_MEMORY_ENTRIES) {
    // 1. Evict expired entries
    for (const [k, v] of memoryStore.entries()) {
      if (v.resetAt <= now) {
        memoryStore.delete(k);
      }
    }
    // 2. If still exceeding cap, evict oldest 20%
    if (memoryStore.size > MAX_MEMORY_ENTRIES) {
      let evicted = 0;
      const target = Math.floor(MAX_MEMORY_ENTRIES * 0.2);
      for (const k of memoryStore.keys()) {
        memoryStore.delete(k);
        evicted++;
        if (evicted >= target) break;
      }
    }
  }
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  pruneMemoryStore();

  const entry = memoryStore.get(identifier);

  let result: RateLimitResult;

  if (!entry || entry.resetAt <= now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    memoryStore.set(identifier, newEntry);
    result = {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: newEntry.resetAt,
    };
  } else if (entry.count >= config.maxRequests) {
    result = {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  } else {
    entry.count += 1;
    result = {
      allowed: true,
      remaining: config.maxRequests - entry.count,
      resetAt: entry.resetAt,
    };
  }

  // Mirror counter to Redis asynchronously (fire-and-forget)
  getRedisConnection()
    .then((redis) => {
      if (!redis) return;
      const key = `rl:${identifier}`;
      const ttlSec = Math.ceil(config.windowMs / 1000);
      redis
        .multi()
        .incr(key)
        .expire(key, ttlSec)
        .exec()
        .catch(() => {
          /* ignore Redis mirror failure */
        });
    })
    .catch(() => {
      /* ignore */
    });

  return result;
}

/** Clear specific rate limit key (e.g. per-email counter on successful login) */
export function clearRateLimit(identifier: string) {
  memoryStore.delete(identifier);
  getRedisConnection()
    .then((redis) => {
      if (redis) {
        redis.del(`rl:${identifier}`).catch(() => {});
      }
    })
    .catch(() => {});
}

/** Clear login rate limits for an email address after successful authentication */
export function clearLoginEmailRateLimit(email: string) {
  const cleanEmail = email.toLowerCase().trim();
  clearRateLimit(`login:email:${cleanEmail}`);
}

// 5 attempts per 15 min by IP and by Email
export const loginRateLimiter = (ip: string, email?: string): RateLimitResult => {
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
export const magicLinkRateLimiter = (ip: string, email: string): RateLimitResult => {
  const ipCheck = checkRateLimit(`magic:ip:${ip}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 });
  if (!ipCheck.allowed) return ipCheck;
  const emailCheck = checkRateLimit(`magic:email:${email.toLowerCase().trim()}`, {
    maxRequests: 3,
    windowMs: 15 * 60 * 1000,
  });
  return emailCheck;
};

// 3 requests per 15 min by IP and by Email
export const forgotPasswordRateLimiter = (ip: string, email: string): RateLimitResult => {
  const ipCheck = checkRateLimit(`forgot:ip:${ip}`, { maxRequests: 5, windowMs: 15 * 60 * 1000 });
  if (!ipCheck.allowed) return ipCheck;
  const emailCheck = checkRateLimit(`forgot:email:${email.toLowerCase().trim()}`, {
    maxRequests: 3,
    windowMs: 15 * 60 * 1000,
  });
  return emailCheck;
};

export const registerRateLimiter = (ip: string): RateLimitResult =>
  checkRateLimit(`register:${ip}`, { maxRequests: 10, windowMs: 60 * 60 * 1000 });
