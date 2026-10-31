import { Queue, Worker, Job } from "bullmq";
import Redis from "ioredis";
import { prisma } from "./db";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redisClient: Redis | null = null;
let redisChecked = false;
let isRedisAvailable = false;

export async function getRedisConnection(): Promise<Redis | null> {
  if (redisChecked) {
    return isRedisAvailable ? redisClient : null;
  }

  try {
    const client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      retryStrategy: () => null, // don't hang if redis is not running
      lazyConnect: true,
      connectTimeout: 2000,
    });

    await client.connect();
    redisClient = client;
    isRedisAvailable = true;
    redisChecked = true;
    console.log("⚡ Lazy connected to Redis for BullMQ queues.");
    return redisClient;
  } catch {
    isRedisAvailable = false;
    redisChecked = true;
    return null;
  }
}

export interface QueueJob<T = any> {
  name: string;
  data: T;
  retryCount?: number;
}

const RETRY_DELAYS = [5000, 30000, 120000]; // 5s, 30s, 2m

export class ResilientQueue<T = any> {
  private queueName: string;
  private bullQueue: Queue | null = null;
  private processor?: (data: T) => Promise<void>;

  constructor(name: string) {
    this.queueName = name;
  }

  process(fn: (data: T) => Promise<void>) {
    this.processor = fn;
  }

  async add(jobName: string, data: T) {
    const connection = await getRedisConnection();
    if (connection) {
      try {
        if (!this.bullQueue) {
          this.bullQueue = new Queue(this.queueName, { connection });
        }
        return await this.bullQueue.add(jobName, data, {
          attempts: 3,
          backoff: { type: "exponential", delay: 5000 },
        });
      } catch (err) {
        console.warn(`[BullMQ:${this.queueName}] Fallback to in-process runner:`, err);
      }
    }

    // In-process resilient fallback runner with retries
    this.runInProcess(jobName, data, 0);
    return { id: `inproc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
  }

  private runInProcess(jobName: string, data: T, attempt: number) {
    setTimeout(async () => {
      if (!this.processor) return;
      try {
        await this.processor(data);
      } catch (err) {
        console.error(`[InProcess:${this.queueName}] Error on attempt ${attempt + 1}:`, err);
        if (attempt < RETRY_DELAYS.length) {
          const delay = RETRY_DELAYS[attempt];
          console.log(`[InProcess:${this.queueName}] Scheduling retry #${attempt + 1} in ${delay / 1000}s`);
          setTimeout(() => this.runInProcess(jobName, data, attempt + 1), delay);
        }
      }
    }, attempt === 0 ? 10 : 0);
  }
}

export const emailQueue = new ResilientQueue("email-jobs");
export const notificationQueue = new ResilientQueue("notification-jobs");
export const reportQueue = new ResilientQueue("report-jobs");

// Auto Checkout Background Worker
export async function runAutoCheckoutWorker(): Promise<{ overstayedCount: number }> {
  try {
    const now = new Date();
    const overdueCheckins = await prisma.checkIn.findMany({
      where: {
        status: "CHECKED_IN",
        expectedCheckout: { lt: now },
      },
      include: {
        visitor: true,
        hostEmployee: { include: { user: true } },
      },
    });

    for (const c of overdueCheckins) {
      await prisma.checkIn.update({
        where: { id: c.id },
        data: { status: "OVERSTAYED" },
      });

      await prisma.securityLog.create({
        data: {
          organizationId: c.visitor.organizationId,
          logType: "VISITOR_OVERSTAYED",
          description: `Visitor ${c.visitor.name} (Badge: ${c.badgeNumber}) exceeded expected checkout time. Status updated to OVERSTAYED.`,
          severity: "HIGH",
          guardName: "System Worker",
        },
      });
    }

    return { overstayedCount: overdueCheckins.length };
  } catch (error) {
    console.error("Auto checkout worker error:", error);
    return { overstayedCount: 0 };
  }
}
