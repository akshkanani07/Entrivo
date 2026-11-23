import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getRedisConnection } from "@/lib/queue";

export async function GET() {
  const startTime = Date.now();
  let dbStatus = "down";
  let dbLatencyMs = 0;
  let redisStatus = "down";
  let redisLatencyMs = 0;

  // 1. Check PostgreSQL Database
  try {
    const dbStart = Date.now();
    await prisma.$queryRawUnsafe("SELECT 1");
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = "up";
  } catch {
    dbStatus = "down";
  }

  // 2. Check Redis
  try {
    const redisStart = Date.now();
    const redis = await getRedisConnection();
    if (redis) {
      await redis.ping();
      redisLatencyMs = Date.now() - redisStart;
      redisStatus = "up";
    } else {
      redisStatus = "degraded_in_memory_fallback";
    }
  } catch {
    redisStatus = "down";
  }

  // 3. Queue status
  const queueStatus = redisStatus === "up" ? "bullmq_active" : "in_process_fallback";
  const isHealthy = dbStatus === "up";
  const overallStatus = isHealthy
    ? redisStatus === "up"
      ? "healthy"
      : "degraded"
    : "unhealthy";

  const totalDurationMs = Date.now() - startTime;

  return NextResponse.json(
    {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      durationMs: totalDurationMs,
      services: {
        database: { status: dbStatus, latencyMs: dbLatencyMs },
        redis: { status: redisStatus, latencyMs: redisLatencyMs },
        queue: { status: queueStatus, driver: queueStatus === "bullmq_active" ? "redis" : "in_memory" },
        sentry: {
          status: process.env.SENTRY_DSN ? "enabled" : "disabled",
        },
      },
      version: "1.0.0",
    },
    { status: isHealthy ? 200 : 503 }
  );
}

