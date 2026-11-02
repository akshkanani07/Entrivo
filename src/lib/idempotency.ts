import "server-only";
import { getRedisConnection } from "./queue";

interface CachedResponse {
  data: any;
  cachedAt: number;
  expiresAt: number;
}

// In-memory cache for fast local lookup and fallback if Redis is unavailable
const memoryCache = new Map<string, CachedResponse>();
const MAX_MEMORY_ITEMS = 5000;

function pruneMemoryCache() {
  const now = Date.now();
  for (const [key, value] of memoryCache.entries()) {
    if (value.expiresAt <= now) {
      memoryCache.delete(key);
    }
  }
  if (memoryCache.size > MAX_MEMORY_ITEMS) {
    const keysToDelete = Array.from(memoryCache.keys()).slice(0, 1000);
    for (const k of keysToDelete) {
      memoryCache.delete(k);
    }
  }
}

/**
 * Checks if an Idempotency-Key has already been processed.
 * Returns the cached response payload if found, or null otherwise.
 */
export async function getIdempotencyResult(
  idempotencyKey: string | null | undefined
): Promise<any | null> {
  if (!idempotencyKey) return null;

  const key = `entrivo:idemp:${idempotencyKey.trim()}`;
  const now = Date.now();

  // 1. Check in-memory cache
  const inMem = memoryCache.get(key);
  if (inMem && inMem.expiresAt > now) {
    return inMem.data;
  }

  // 2. Check Redis
  try {
    const redis = await getRedisConnection();
    if (redis) {
      const raw = await redis.get(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Refresh memory cache
        memoryCache.set(key, {
          data: parsed,
          cachedAt: now,
          expiresAt: now + 3600 * 1000,
        });
        return parsed;
      }
    }
  } catch {
    // Non-blocking fallback
  }

  return null;
}

/**
 * Persists the result of an operation performed under an Idempotency-Key.
 */
export async function saveIdempotencyResult(
  idempotencyKey: string | null | undefined,
  responseData: any,
  ttlSeconds = 86400
): Promise<void> {
  if (!idempotencyKey) return;

  const key = `entrivo:idemp:${idempotencyKey.trim()}`;
  const now = Date.now();

  // 1. Save in-memory
  pruneMemoryCache();
  memoryCache.set(key, {
    data: responseData,
    cachedAt: now,
    expiresAt: now + ttlSeconds * 1000,
  });

  // 2. Save in Redis
  try {
    const redis = await getRedisConnection();
    if (redis) {
      await redis.set(key, JSON.stringify(responseData), "EX", ttlSeconds);
    }
  } catch {
    // Non-blocking
  }
}

